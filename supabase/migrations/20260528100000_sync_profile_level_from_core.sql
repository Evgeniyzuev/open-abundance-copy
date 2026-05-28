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
  where user_id = new.user_id
    and level is distinct from new.level;

  return new;
end;
$$;

drop trigger if exists trigger_update_core_level on public.core_accounts;
create trigger trigger_update_core_level
before insert or update of balance on public.core_accounts
for each row
execute function public.update_core_level();

update public.user_profiles profile
set level = core.level,
    updated_at = now()
from public.core_accounts core
where profile.user_id = core.user_id
  and profile.level is distinct from core.level;
