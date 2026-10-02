-- Aprovação atômica sem função SECURITY DEFINER exposta:
-- ao inserir um editor, o pedido pendente é removido na mesma transação.
drop function if exists public.repair_approve_access(uuid);

create or replace function private.repair_clear_access_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.repair_access_requests
  where user_id = new.user_id;
  return new;
end;
$$;

revoke all on function private.repair_clear_access_request() from public, anon, authenticated;

drop trigger if exists repair_members_clear_request on public.repair_members;
create trigger repair_members_clear_request
after insert on public.repair_members
for each row
when (new.role = 'editor')
execute function private.repair_clear_access_request();
