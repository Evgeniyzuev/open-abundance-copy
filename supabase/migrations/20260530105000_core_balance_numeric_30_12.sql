drop trigger if exists trigger_update_core_level on public.core_accounts;

alter table public.core_accounts
alter column balance type numeric(30, 12)
using balance::numeric(30, 12);

create trigger trigger_update_core_level
before insert or update of balance on public.core_accounts
for each row
execute function public.update_core_level();
