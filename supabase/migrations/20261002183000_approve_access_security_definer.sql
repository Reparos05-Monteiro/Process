-- A RPC de aprovação executa a transação com privilégios do proprietário,
-- mas só depois de validar explicitamente o administrador autenticado.
create or replace function public.repair_approve_access(p_user_id uuid)
returns void
language plpgsql
security definer
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
