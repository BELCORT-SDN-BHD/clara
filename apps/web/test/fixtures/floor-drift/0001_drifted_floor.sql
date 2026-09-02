-- A FIXTURE, NOT A MIGRATION. It is never applied to any database and lives under
-- `apps/web/test/fixtures/` precisely so nothing in `packages/db/migrations/` can pick it up.
--
-- WHY IT EXISTS. `do-action-floors.test.ts` compares the ⌘K "Do" catalog's transcribed floors
-- against the real migrations. Every one of those comparisons would look identical if the guard
-- secretly read the catalog twice instead of parsing a body — a self-consistency check wearing a
-- drift guard's clothes. Pointing the SAME resolver at this directory must yield `owner`, which
-- only a resolver that actually reads `_human_ctx(role_rank(...))` out of the body can do.
--
-- So the floor below is DELIBERATELY WRONG relative to production: `clara.begin_client_onboarding`
-- really floors at `admin` (`0017_wave_b.sql`). The disagreement IS the control. Do not "fix" it.
--
-- The body is a minimal stand-in — the shape the extractor reads, and nothing else. It carries no
-- op_key handling, no dedupe, no insert, because the guard reads exactly one line out of it.

create function clara.begin_client_onboarding(p_name text,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  return jsonb_build_object('fixture', true);
end $$;
