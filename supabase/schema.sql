-- Execute uma vez no SQL Editor do projeto Supabase escolhido.
-- Não remove registros existentes; novas instalações começam com 0 casos.
-- Crie os usuários em Authentication > Users e cadastre seus UUIDs em repair_members.

create table if not exists public.repair_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

create table if not exists public.repair_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  description text not null default '' check (char_length(description) <= 120),
  color text not null default '#e9bc75' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default '◇' check (icon in ('◇','◈','↗','✳','✓','↺','●','⌁','□','✦')),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists repair_stages_name_unique on public.repair_stages (lower(btrim(name)));
create index if not exists repair_stages_order_idx on public.repair_stages (sort_order, id);

create table if not exists public.repair_settings (
  id integer primary key default 1 check (id = 1),
  title text not null check (char_length(btrim(title)) between 2 and 60),
  stale_days integer not null default 21 check (stale_days between 1 and 365),
  visible_cards integer not null default 2 check (visible_cards between 0 and 2)
);

create table if not exists public.repair_cases (
  id bigint generated always as identity primary key,
  stage_id uuid not null references public.repair_stages(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  address text not null check (char_length(btrim(address)) between 2 and 180),
  owner text not null check (char_length(btrim(owner)) between 2 and 80),
  priority text not null default 'Normal' check (priority in ('Baixa','Normal','Alta')),
  description text not null default '' check (char_length(description) <= 3000),
  note text not null default '' check (char_length(note) <= 5000),
  opened_on date not null default current_date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repair_cases_stage_opened_idx on public.repair_cases (stage_id, opened_on, id);

-- updated_at pertence ao banco; o cliente não tem permissão para alterá-lo.
create or replace function public.repair_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.repair_touch_updated_at() from public, anon, authenticated;
drop trigger if exists repair_cases_touch on public.repair_cases;
create trigger repair_cases_touch before update on public.repair_cases
  for each row execute function public.repair_touch_updated_at();

-- A alteração da ordem ocorre em uma transação única; IDs continuam estáveis.
create or replace function public.repair_reorder_stages(p_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare
  expected_count integer;
begin
  if not exists (select 1 from public.repair_members
    where user_id = (select auth.uid()) and role = 'admin') then
    raise exception 'Somente o administrador pode reordenar etapas.' using errcode = '42501';
  end if;
  select count(*) into expected_count from public.repair_stages;
  if coalesce(cardinality(p_ids), 0) <> expected_count
    or (select count(distinct input.id) from unnest(p_ids) as input(id)) <> expected_count
    or exists (select 1 from unnest(p_ids) as input(id)
      left join public.repair_stages s on s.id = input.id where s.id is null) then
    raise exception 'A lista de etapas mudou. Recarregue e tente novamente.';
  end if;
  update public.repair_stages as s set sort_order = input.position::integer * 10
    from unnest(p_ids) with ordinality as input(id, position)
    where s.id = input.id;
end;
$$;
revoke all on function public.repair_reorder_stages(uuid[]) from public, anon;
grant execute on function public.repair_reorder_stages(uuid[]) to authenticated;

alter table public.repair_members enable row level security;
alter table public.repair_stages enable row level security;
alter table public.repair_settings enable row level security;
alter table public.repair_cases enable row level security;

-- Remove permissões automáticas que projetos antigos podem ter criado.
grant usage on schema public to anon, authenticated;
revoke all on public.repair_members, public.repair_stages, public.repair_settings, public.repair_cases from anon, authenticated;
grant select on public.repair_members to authenticated;
grant select on public.repair_stages, public.repair_settings to anon, authenticated;
grant insert, delete on public.repair_stages to authenticated;
grant update (name, description, color, icon, sort_order) on public.repair_stages to authenticated;
grant update (title, stale_days, visible_cards) on public.repair_settings to authenticated;
grant select on public.repair_cases to authenticated;
grant insert (stage_id, title, address, owner, priority, description, note, opened_on) on public.repair_cases to authenticated;
grant update (stage_id, title, address, owner, priority, description, note, opened_on) on public.repair_cases to authenticated;
grant delete on public.repair_cases to authenticated;
grant usage on sequence public.repair_cases_id_seq to authenticated;

drop policy if exists repair_members_read_self on public.repair_members;
create policy repair_members_read_self on public.repair_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists repair_stages_read on public.repair_stages;
create policy repair_stages_read on public.repair_stages for select to anon, authenticated using (true);
drop policy if exists repair_stages_insert_admin on public.repair_stages;
create policy repair_stages_insert_admin on public.repair_stages for insert to authenticated
  with check (exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'));
drop policy if exists repair_stages_update_admin on public.repair_stages;
create policy repair_stages_update_admin on public.repair_stages for update to authenticated
  using (exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'))
  with check (exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'));
drop policy if exists repair_stages_delete_admin on public.repair_stages;
create policy repair_stages_delete_admin on public.repair_stages for delete to authenticated
  using (exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'));

drop policy if exists repair_settings_read on public.repair_settings;
create policy repair_settings_read on public.repair_settings for select to anon, authenticated using (true);
drop policy if exists repair_settings_update_admin on public.repair_settings;
create policy repair_settings_update_admin on public.repair_settings for update to authenticated
  using (id = 1 and exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'))
  with check (id = 1 and exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'));

drop policy if exists repair_cases_read_member on public.repair_cases;
create policy repair_cases_read_member on public.repair_cases for select to authenticated
  using (exists (select 1 from public.repair_members m where m.user_id = (select auth.uid())));
drop policy if exists repair_cases_insert_member on public.repair_cases;
create policy repair_cases_insert_member on public.repair_cases for insert to authenticated
  with check (created_by = (select auth.uid()) and exists
    (select 1 from public.repair_members m where m.user_id = (select auth.uid())));
drop policy if exists repair_cases_update_member on public.repair_cases;
create policy repair_cases_update_member on public.repair_cases for update to authenticated
  using (exists (select 1 from public.repair_members m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.repair_members m where m.user_id = (select auth.uid())));
drop policy if exists repair_cases_delete_admin on public.repair_cases;
create policy repair_cases_delete_admin on public.repair_cases for delete to authenticated
  using (exists (select 1 from public.repair_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'));

-- Somente seis etapas iniciais. Nenhum caso fictício é inserido.
insert into public.repair_settings (id, title, stale_days, visible_cards)
values (1, 'Mapa de Reparos', 21, 2) on conflict (id) do nothing;
insert into public.repair_stages (name, description, color, icon, sort_order)
select data.name, data.description, data.color, data.icon, data.sort_order
from (values
  ('Orçando', 'Levantamento e orçamento', '#f0bd63', '◇', 10),
  ('Análise', 'Conferência dos valores', '#a9b2ef', '◈', 20),
  ('Enviado', 'Aguardando retorno', '#eaa9ac', '↗', 30),
  ('Execução', 'Serviço em andamento', '#89cab7', '✳', 40),
  ('Finalizado', 'Serviço concluído', '#9dc9e8', '✓', 50),
  ('Execução PR', 'Etapa PR', '#d5adf0', '↺', 60)
) as data(name, description, color, icon, sort_order)
where not exists (select 1 from public.repair_stages);