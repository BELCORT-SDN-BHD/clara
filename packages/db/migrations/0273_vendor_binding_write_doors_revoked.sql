-- 0273_vendor_binding_write_doors_revoked — #921 (riders wave 3, lane 01): MAKE THE LEGACY
-- VENDOR-BINDINGS PANEL READ-ONLY. Revokes the human EXECUTE grant on propose/sign/decline;
-- list/get/revoke are untouched.
-- =====================================================================================
-- Spec of record: ticket #921's Agent Brief (ready-for-agent, filed from the owner's 2026-09-18
-- review, the #841/#887 discussion). No owner-ruling comment dated 2026-09-20 exists on #921
-- itself; the Agent Brief in the issue body is the newest and only binding text, re-verified
-- live on this branch (`gh issue view 921 --json body,comments` — zero comments).
--
-- THE RULING, IN ONE SENTENCE. The blueprint retires the vendor-binding workflow (O37); D6
-- keeps only "historical receipts and in-flight legacy visibility". No human role may propose,
-- sign or decline a NEW vendor identity binding; the panel keeps history (list/get) and the
-- ability to close an in-flight LIVE binding (revoke). The Client-KB / counterparty-identity
-- lane (#647) is the replacement — untouched by this file.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. `revoke execute` on THREE function signatures from
-- `clara_authenticated` — nothing else. No table, column, trigger, policy, function BODY, or
-- any OTHER role's ACL on any of the five vendor-binding doors moves.
--
--   REVOKE EXECUTE ON FUNCTION clara.propose_vendor_identity_binding(jsonb,text)     FROM clara_authenticated
--   REVOKE EXECUTE ON FUNCTION clara.sign_vendor_identity_binding(uuid,text,text)    FROM clara_authenticated
--   REVOKE EXECUTE ON FUNCTION clara.decline_vendor_identity_binding(uuid,text,text) FROM clara_authenticated
--
-- WHY REVOKE AND NOT DROP. #921's own "Out of scope" is explicit: "Removing the lane's tables,
-- doors or historical rows (D6 keeps them)." Unlike 0271's `create_account_set_v1` (a zero-
-- caller decoy the owner ruled DROPPED outright), these three bodies remain the only record of
-- how a still-visible 'proposed' / 'live' / 'declined' historical row came to exist, and
-- revoking rather than dropping keeps every one of those rows' provenance columns meaningful
-- without resurrecting a body from source control if the ruling is ever revisited.
--
-- WHAT STAYS GRANTED, PINNED BELOW AND RE-PINNED IN THE TAIL, BYTE-IDENTICAL (measured on THIS
-- lane database now — the wave-3 addendum's own rule: "pin what is LIVE on your lane database
-- after the ticket before you"; #890, the ticket before this one in this lane, never touched
-- this table or these functions):
--   · clara.revoke_vendor_identity_binding(uuid,text,text) — closing an in-flight LIVE binding,
--     unmoved since 0028
--   · clara.list_vendor_bindings(uuid)                     — history, unmoved since 0028
--   · clara.get_vendor_binding(uuid)                       — history, unmoved since 0028
--
-- WHAT THIS FILE DOES NOT COVER.
--   · `clara.wake_propose_vendor_identity_binding` / `clara.wake_list_binding_candidates`
--     (the AGENT/wake-lane doors, 0154) are UNTOUCHED — the ticket brief names only the three
--     HUMAN doors, and the runtime's own routing already has no live path into the proposal
--     wake door (the ticket's own "Current behavior" text).
--   · `clara.reset_binding_decline` (0154) is ALSO untouched: it is the door that lifts a
--     decline on an ALREADY-EXISTING historical row — exactly the "in-flight legacy
--     visibility" D6 keeps — and the brief's "Key interfaces" names only propose/sign/decline
--     for revocation.
--   · The vendor-binding lane's tables, triggers, policies, evidence rows and historical rows:
--     untouched (explicitly out of scope).
--   · `apps/web`'s vendor-bindings panel and its capability flags: edited in the SAME PR, not
--     in this file (frontend files carry no schema and are outside a migration's own diff).
--
-- REDO-SAFE (#957). `revoke execute ... from <role>` is a no-op, not an error, against a grant
-- that is already absent, so the REVOKE statements below need no `if exists` guard. The
-- prestate is written to succeed on EITHER the first apply (all three still granted true) or a
-- `CLARA_MIGRATION_REDO` re-run of this same file (all three already false) — it never asserts
-- the grant's PRESENCE unconditionally, only that the three doors this file moves are in the
-- SAME state as one another (never a partial revoke) before proceeding, and that the three
-- neighbours this file must not touch are untouched and still granted, in either branch.
-- =====================================================================================

do $t921_pre$
declare
  v_propose text := 'clara.propose_vendor_identity_binding(jsonb,text)';
  v_sign text := 'clara.sign_vendor_identity_binding(uuid,text,text)';
  v_decline text := 'clara.decline_vendor_identity_binding(uuid,text,text)';
  v_revoke_fn text := 'clara.revoke_vendor_identity_binding(uuid,text,text)';
  v_list text := 'clara.list_vendor_bindings(uuid)';
  v_get text := 'clara.get_vendor_binding(uuid)';
  v_sha text;
  v_propose_auth boolean;
  v_sign_auth boolean;
  v_decline_auth boolean;
  v_pub boolean;
begin
  -- THE THREE DOORS THIS FILE MOVES. Pin each body's prosrc sha256 (MEASURED on clara_l01 now)
  -- unconditionally — a REVOKE never touches body text, so this pin holds in both branches and
  -- is re-asserted verbatim in the tail. Read the CURRENT grant state (whichever it is) rather
  -- than assuming "first apply".
  if to_regprocedure(v_propose) is null then
    raise exception '#921 prestate: % is absent — 0154 must apply first', v_propose using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_propose::regprocedure;
  if v_sha is distinct from 'fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not change its body, so re-measure before revoking its grant',
      v_propose, v_sha using errcode='CLR10';
  end if;
  select has_function_privilege('clara_authenticated', v_propose::regprocedure, 'execute') into v_propose_auth;

  if to_regprocedure(v_sign) is null then
    raise exception '#921 prestate: % is absent — 0154 must apply first', v_sign using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_sign::regprocedure;
  if v_sha is distinct from 'b56d25542f6edbaf59a22948d7e0768e836cd6163763af3ffbe41469f4c9826c' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not change its body, so re-measure before revoking its grant',
      v_sign, v_sha using errcode='CLR10';
  end if;
  select has_function_privilege('clara_authenticated', v_sign::regprocedure, 'execute') into v_sign_auth;

  if to_regprocedure(v_decline) is null then
    raise exception '#921 prestate: % is absent — 0154 must apply first', v_decline using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_decline::regprocedure;
  if v_sha is distinct from 'b289a0b660a2817d9bfeb0d368494467f4135ac8e9ba9423e3abfb52378bdbad' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not change its body, so re-measure before revoking its grant',
      v_decline, v_sha using errcode='CLR10';
  end if;
  select has_function_privilege('clara_authenticated', v_decline::regprocedure, 'execute') into v_decline_auth;

  if v_propose_auth is distinct from v_sign_auth or v_propose_auth is distinct from v_decline_auth then
    raise exception '#921 prestate: the three doors this file moves are in DIFFERENT grant states (propose=%, sign=%, decline=%) — a partial prior revoke is not a state this file was written to repair',
      v_propose_auth, v_sign_auth, v_decline_auth using errcode='CLR10';
  end if;
  if v_propose_auth then
    raise notice '#921 prestate: FIRST APPLY — propose/sign/decline are all still granted to clara_authenticated; revoking now.';
  else
    raise notice '#921 prestate: REDO — propose/sign/decline are already ungranted (CLARA_MIGRATION_REDO of this file); the REVOKE statements below are no-ops.';
  end if;

  -- THE THREE NEIGHBOURS THIS FILE MUST NOT TOUCH — pinned unconditionally, in EITHER branch:
  -- byte-identical body and still granted to clara_authenticated, exactly as 0028 left them.
  if to_regprocedure(v_revoke_fn) is null then
    raise exception '#921 prestate: % is absent — 0028 must apply first', v_revoke_fn using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_revoke_fn::regprocedure;
  if v_sha is distinct from 'b0b566b36d84b17469425a86fdfd4c68fcaebea6dd793b3edb2f1bce609433ce' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not touch it, so re-measure before applying',
      v_revoke_fn, v_sha using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_revoke_fn::regprocedure, 'execute') then
    raise exception '#921 prestate: % is not granted to clara_authenticated — D6 keeps this door and this file must not be the reason it is missing',
      v_revoke_fn using errcode='CLR10';
  end if;

  if to_regprocedure(v_list) is null then
    raise exception '#921 prestate: % is absent — 0028 must apply first', v_list using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_list::regprocedure;
  if v_sha is distinct from '53a0d3fcd9f37fe9a23aebf9862e9adb2af316dfaf2aef3d97b2aaf7ffa0c7fe' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not touch it, so re-measure before applying',
      v_list, v_sha using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_list::regprocedure, 'execute') then
    raise exception '#921 prestate: % is not granted to clara_authenticated — D6 keeps this door and this file must not be the reason it is missing',
      v_list using errcode='CLR10';
  end if;

  if to_regprocedure(v_get) is null then
    raise exception '#921 prestate: % is absent — 0028 must apply first', v_get using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_get::regprocedure;
  if v_sha is distinct from 'ce1e8bc460a4caac4b23c524987f0654a38015ac429759c6c77d91c03cf954a7' then
    raise exception '#921 prestate: % has DRIFTED from its measured pre-image (got %) — this file must not touch it, so re-measure before applying',
      v_get, v_sha using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_get::regprocedure, 'execute') then
    raise exception '#921 prestate: % is not granted to clara_authenticated — D6 keeps this door and this file must not be the reason it is missing',
      v_get using errcode='CLR10';
  end if;

  -- No PUBLIC leak on any of the six, in either branch — the estate's standing invariant.
  for v_pub in
    select has_function_privilege('public', s::regprocedure, 'execute')
      from unnest(array[v_propose, v_sign, v_decline, v_revoke_fn, v_list, v_get]) s
  loop
    if v_pub then
      raise exception '#921 prestate: PUBLIC holds EXECUTE on one of the six vendor-binding doors — that leak predates this file and must be fixed before it applies'
        using errcode='CLR10';
    end if;
  end loop;
end
$t921_pre$;

-- =====================================================================================
-- THE CHANGE. Idempotent by construction (see the header's REDO-SAFE note) — no `if exists`
-- guard is needed or written.
-- =====================================================================================
revoke execute on function clara.propose_vendor_identity_binding(jsonb,text) from clara_authenticated;
revoke execute on function clara.sign_vendor_identity_binding(uuid,text,text) from clara_authenticated;
revoke execute on function clara.decline_vendor_identity_binding(uuid,text,text) from clara_authenticated;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the REVOKE ran as written.
-- =====================================================================================
do $t921_tail$
declare
  v_propose text := 'clara.propose_vendor_identity_binding(jsonb,text)';
  v_sign text := 'clara.sign_vendor_identity_binding(uuid,text,text)';
  v_decline text := 'clara.decline_vendor_identity_binding(uuid,text,text)';
  v_revoke_fn text := 'clara.revoke_vendor_identity_binding(uuid,text,text)';
  v_list text := 'clara.list_vendor_bindings(uuid)';
  v_get text := 'clara.get_vendor_binding(uuid)';
  v_sha text;
begin
  -- THE THREE REVOKED DOORS: no human EXECUTE, no PUBLIC leak, body byte-identical to the
  -- pinned pre-image (a REVOKE must never move a function's text).
  if has_function_privilege('clara_authenticated', v_propose::regprocedure, 'execute') then
    raise exception '#921 tail: clara_authenticated can still execute %', v_propose using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_propose::regprocedure, 'execute') then
    raise exception '#921 tail: PUBLIC can execute %', v_propose using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_propose::regprocedure;
  if v_sha is distinct from 'fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82' then
    raise exception '#921 tail: % MOVED while this file applied — a grant-only change must not touch body text (got %)',
      v_propose, v_sha using errcode='CLR10';
  end if;

  if has_function_privilege('clara_authenticated', v_sign::regprocedure, 'execute') then
    raise exception '#921 tail: clara_authenticated can still execute %', v_sign using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_sign::regprocedure, 'execute') then
    raise exception '#921 tail: PUBLIC can execute %', v_sign using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_sign::regprocedure;
  if v_sha is distinct from 'b56d25542f6edbaf59a22948d7e0768e836cd6163763af3ffbe41469f4c9826c' then
    raise exception '#921 tail: % MOVED while this file applied — a grant-only change must not touch body text (got %)',
      v_sign, v_sha using errcode='CLR10';
  end if;

  if has_function_privilege('clara_authenticated', v_decline::regprocedure, 'execute') then
    raise exception '#921 tail: clara_authenticated can still execute %', v_decline using errcode='CLR10';
  end if;
  if has_function_privilege('public', v_decline::regprocedure, 'execute') then
    raise exception '#921 tail: PUBLIC can execute %', v_decline using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_decline::regprocedure;
  if v_sha is distinct from 'b289a0b660a2817d9bfeb0d368494467f4135ac8e9ba9423e3abfb52378bdbad' then
    raise exception '#921 tail: % MOVED while this file applied — a grant-only change must not touch body text (got %)',
      v_decline, v_sha using errcode='CLR10';
  end if;

  -- THE THREE UNTOUCHED NEIGHBOURS: still granted, still byte-identical.
  if not has_function_privilege('clara_authenticated', v_revoke_fn::regprocedure, 'execute') then
    raise exception '#921 tail: % lost its clara_authenticated grant — this file must not touch it', v_revoke_fn using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_revoke_fn::regprocedure;
  if v_sha is distinct from 'b0b566b36d84b17469425a86fdfd4c68fcaebea6dd793b3edb2f1bce609433ce' then
    raise exception '#921 tail: % MOVED while this file applied — it must not have (got %)', v_revoke_fn, v_sha using errcode='CLR10';
  end if;

  if not has_function_privilege('clara_authenticated', v_list::regprocedure, 'execute') then
    raise exception '#921 tail: % lost its clara_authenticated grant — this file must not touch it', v_list using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_list::regprocedure;
  if v_sha is distinct from '53a0d3fcd9f37fe9a23aebf9862e9adb2af316dfaf2aef3d97b2aaf7ffa0c7fe' then
    raise exception '#921 tail: % MOVED while this file applied — it must not have (got %)', v_list, v_sha using errcode='CLR10';
  end if;

  if not has_function_privilege('clara_authenticated', v_get::regprocedure, 'execute') then
    raise exception '#921 tail: % lost its clara_authenticated grant — this file must not touch it', v_get using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_get::regprocedure;
  if v_sha is distinct from 'ce1e8bc460a4caac4b23c524987f0654a38015ac429759c6c77d91c03cf954a7' then
    raise exception '#921 tail: % MOVED while this file applied — it must not have (got %)', v_get, v_sha using errcode='CLR10';
  end if;

  raise notice '#921 tail: OK — clara_authenticated can no longer execute propose_vendor_identity_binding, sign_vendor_identity_binding or decline_vendor_identity_binding (bodies unmoved); revoke_vendor_identity_binding, list_vendor_bindings and get_vendor_binding remain granted, byte-identical to their measured pre-images. The wake/agent doors, reset_binding_decline, and the lane''s tables and historical rows are untouched.';
end
$t921_tail$;
