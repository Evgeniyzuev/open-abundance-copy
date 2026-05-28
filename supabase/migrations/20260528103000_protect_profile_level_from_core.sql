create or replace function public.sync_profile_level_from_core()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_core_level integer;
begin
  select level
  into current_core_level
  from public.core_accounts
  where user_id = new.user_id;

  if current_core_level is not null then
    new.level := current_core_level;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_sync_profile_level_from_core on public.user_profiles;
create trigger trigger_sync_profile_level_from_core
before insert or update on public.user_profiles
for each row
execute function public.sync_profile_level_from_core();

update public.user_profiles profile
set level = core.level,
    updated_at = now()
from public.core_accounts core
where profile.user_id = core.user_id
  and profile.level is distinct from core.level;
