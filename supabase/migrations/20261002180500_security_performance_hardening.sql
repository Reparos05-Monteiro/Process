-- Hardening de segurança, consistência e performance.
-- Compatível com a versão anterior do frontend.

create or replace function private.repair_is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.repair_members
    where user_id = (select auth.uid())
  );
$$;

create or replace function private.repair_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.repair_members
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function private.repair_is_member() from public, anon, authenticated;
revoke all on function private.repair_is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.repair_is_member(), private.repair_is_admin() to authenticated;

-- Dados operacionais da aplicação não precisam ser públicos antes do login.
revoke select on public.repair_stages, public.repair_settings from anon;
grant select on public.repair_stages, public.repair_settings to authenticated;

drop policy if exists repair_stages_read on public.repair_stages;
create policy repair_stages_read on public.repair_stages for select to authenticated
  using ((select private.repair_is_member()));

drop policy if exists repair_settings_read on public.repair_settings;
create policy repair_settings_read on public.repair_settings for select to authenticated
  using ((select private.repair_is_member()));

drop policy if exists repair_stages_insert_admin on public.repair_stages;
create policy repair_stages_insert_admin on public.repair_stages for insert to authenticated
  with check ((select private.repair_is_admin()));
drop policy if exists repair_stages_update_admin on public.repair_stages;
create policy repair_stages_update_admin on public.repair_stages for update to authenticated
  using ((select private.repair_is_admin()))
  with check ((select private.repair_is_admin()));
drop policy if exists repair_stages_delete_admin on public.repair_stages;
create policy repair_stages_delete_admin on public.repair_stages for delete to authenticated
  using ((select private.repair_is_admin()));

drop policy if exists repair_settings_update_admin on public.repair_settings;
create policy repair_settings_update_admin on public.repair_settings for update to authenticated
  using (id = 1 and (select private.repair_is_admin()))
  with check (id = 1 and (select private.repair_is_admin()));

drop policy if exists repair_cases_read_member on public.repair_cases;
create policy repair_cases_read_member on public.repair_cases for select to authenticated
  using ((select private.repair_is_member()));
drop policy if exists repair_cases_insert_member on public.repair_cases;
create policy repair_cases_insert_member on public.repair_cases for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.repair_is_member()));
drop policy if exists repair_cases_update_member on public.repair_cases;
create policy repair_cases_update_member on public.repair_cases for update to authenticated
  using ((select private.repair_is_member()))
  with check ((select private.repair_is_member()));
drop policy if exists repair_cases_delete_admin on public.repair_cases;
create policy repair_cases_delete_admin on public.repair_cases for delete to authenticated
  using ((select private.repair_is_admin()));

drop policy if exists repair_access_requests_read on public.repair_access_requests;
create policy repair_access_requests_read on public.repair_access_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.repair_is_admin()));
drop policy if exists repair_access_requests_delete_admin on public.repair_access_requests;
create policy repair_access_requests_delete_admin on public.repair_access_requests for delete to authenticated
  using ((select private.repair_is_admin()));

-- Aprovação passa a ser atômica: membro e pedido nunca ficam em estados divergentes.
create or replace function public.repair_approve_access(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.repair_is_admin()) then
    raise exception 'Somente o administrador pode liberar acessos.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.repair_access_requests where user_id = p_user_id
  ) then
    raise exception 'Solicitação de acesso não encontrada.';
  end if;

  insert into public.repair_members (user_id, role)
  values (p_user_id, 'editor')
  on conflict (user_id) do nothing;

  delete from public.repair_access_requests where user_id = p_user_id;
end;
$$;
revoke all on function public.repair_approve_access(uuid) from public, anon;
grant execute on function public.repair_approve_access(uuid) to authenticated;

-- O layout suporta no máximo 12 etapas; o banco passa a garantir a mesma regra.
create or replace function public.repair_enforce_stage_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('repair_stages_limit'));
  if (select count(*) from public.repair_stages) >= 12 then
    raise exception 'O sistema aceita no máximo 12 etapas.';
  end if;
  return new;
end;
$$;
revoke all on function public.repair_enforce_stage_limit() from public, anon, authenticated;
drop trigger if exists repair_stages_limit on public.repair_stages;
create trigger repair_stages_limit
before insert on public.repair_stages
for each row execute function public.repair_enforce_stage_limit();

-- Índices para relações e ordenações que crescem junto com a base.
create index if not exists repair_cases_created_by_idx
  on public.repair_cases (created_by);
create index if not exists repair_access_requests_requested_idx
  on public.repair_access_requests (requested_at desc);
