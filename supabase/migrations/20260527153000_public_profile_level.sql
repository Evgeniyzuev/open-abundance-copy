alter table public.user_profiles
add column if not exists level integer not null default 0 check (level >= 0);

create or replace function public.update_core_level()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.level := public.calculate_core_level(new.balance);
  new.updated_at := now();

  update public.user_profiles
  set level = new.level,
      updated_at = now()
  where user_id = new.user_id;

  return new;
end;
$$;

update public.user_profiles profile
set level = core.level,
    updated_at = now()
from public.core_accounts core
where profile.user_id = core.user_id;
