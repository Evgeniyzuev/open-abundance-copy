create table if not exists public.level_thresholds (
  level integer primary key check (level >= 1),
  core_required numeric(20, 2) not null check (core_required > 0),
  title text,
  created_at timestamptz not null default now()
);

insert into public.level_thresholds (level, core_required, title) values
  (1, 2, 'Начальный'),
  (2, 4, null),
  (3, 8, null),
  (4, 16, null),
  (5, 32, null),
  (6, 64, null),
  (7, 128, null),
  (8, 250, null),
  (9, 500, null),
  (10, 1000, 'Первая тысяча'),
  (11, 2000, null),
  (12, 4000, null),
  (13, 8000, null),
  (14, 16000, null),
  (15, 32000, null),
  (16, 64000, null),
  (17, 128000, null),
  (18, 250000, null),
  (19, 500000, null),
  (20, 1000000, 'Миллионер'),
  (21, 2000000, null),
  (22, 4000000, null),
  (23, 8000000, null),
  (24, 16000000, null),
  (25, 32000000, null),
  (26, 64000000, null),
  (27, 128000000, null),
  (28, 250000000, null),
  (29, 500000000, null),
  (30, 1000000000, 'Миллиардер'),
  (31, 2000000000, null),
  (32, 4000000000, null),
  (33, 8000000000, null),
  (34, 16000000000, null),
  (35, 32000000000, null),
  (36, 64000000000, null),
  (37, 128000000000, null),
  (38, 250000000000, null),
  (39, 500000000000, null),
  (40, 1000000000000, 'Триллионер')
on conflict (level) do update
set core_required = excluded.core_required,
    title = excluded.title;

alter table public.level_thresholds enable row level security;

drop policy if exists "Everyone can read level thresholds" on public.level_thresholds;
create policy "Everyone can read level thresholds"
on public.level_thresholds
for select
using (true);

alter table public.core_accounts
add column if not exists last_seen_level integer not null default 0 check (last_seen_level >= 0);

create or replace function public.calculate_core_level(core_balance numeric)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select level
      from public.level_thresholds
      where core_required <= core_balance
      order by level desc
      limit 1
    ),
    0
  );
$$;

create or replace function public.update_core_level()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.level := public.calculate_core_level(new.balance);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trigger_update_core_level on public.core_accounts;
create trigger trigger_update_core_level
before insert or update of balance on public.core_accounts
for each row
execute function public.update_core_level();

update public.core_accounts
set balance = balance;
