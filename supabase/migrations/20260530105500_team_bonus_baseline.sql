alter table public.team_memberships
add column if not exists team_bonus_base_balance numeric(30, 12),
add column if not exists team_bonus_base_at timestamptz;

update public.team_memberships membership
set team_bonus_base_balance = core.balance::numeric(30, 12),
    team_bonus_base_at = coalesce(membership.team_bonus_base_at, now())
from public.core_accounts core
where core.user_id = membership.member_user_id
  and membership.team_bonus_base_balance is null;

update public.team_memberships
set team_bonus_base_balance = 0,
    team_bonus_base_at = coalesce(team_bonus_base_at, now())
where team_bonus_base_balance is null;

alter table public.team_memberships
alter column team_bonus_base_balance set default 0,
alter column team_bonus_base_balance set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_memberships_team_bonus_base_balance_nonnegative'
      and conrelid = 'public.team_memberships'::regclass
  ) then
    alter table public.team_memberships
    add constraint team_memberships_team_bonus_base_balance_nonnegative
    check (team_bonus_base_balance >= 0);
  end if;
end;
$$;
