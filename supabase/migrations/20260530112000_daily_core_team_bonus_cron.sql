create extension if not exists pg_cron;

create table if not exists public.daily_core_accruals (
  accrual_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  core_before numeric(30, 12) not null check (core_before >= 0),
  daily_rate numeric(12, 10) not null check (daily_rate >= 0),
  gross_amount numeric(30, 12) not null check (gross_amount >= 0),
  reinvest_percent numeric(5, 2) not null check (reinvest_percent >= 0 and reinvest_percent <= 100),
  core_amount numeric(30, 12) not null check (core_amount >= 0),
  wallet_amount numeric(20, 2) not null check (wallet_amount >= 0),
  core_after numeric(30, 12) not null check (core_after >= 0),
  created_at timestamptz not null default now(),
  primary key (accrual_date, user_id)
);

create table if not exists public.team_core_growth_rewards (
  id uuid primary key default gen_random_uuid(),
  bonus_date date not null,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  leader_user_id uuid not null references auth.users(id) on delete cascade,
  source_core_before numeric(30, 12) not null check (source_core_before >= 0),
  source_core_after numeric(30, 12) not null check (source_core_after >= 0),
  source_core_delta numeric(30, 12) not null check (source_core_delta > 0),
  reward_amount numeric(20, 2) not null check (reward_amount > 0),
  settlement_kind text not null default 'daily' check (settlement_kind in ('daily', 'leader_change')),
  depth integer not null default 1 check (depth >= 1),
  batch_id uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists team_core_growth_rewards_daily_once_idx
on public.team_core_growth_rewards (bonus_date, source_user_id, leader_user_id)
where settlement_kind = 'daily';

alter table public.daily_core_accruals enable row level security;
alter table public.team_core_growth_rewards enable row level security;

drop policy if exists "Users can read own daily core accruals" on public.daily_core_accruals;
create policy "Users can read own daily core accruals"
on public.daily_core_accruals
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own team core rewards" on public.team_core_growth_rewards;
create policy "Users can read own team core rewards"
on public.team_core_growth_rewards
for select
using (auth.uid() = source_user_id or auth.uid() = leader_user_id);

create or replace function public.run_daily_core_accrual(
  p_accrual_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account record;
  daily_rate constant numeric(12, 10) := 0.0006330000;
  gross_amount numeric(30, 12);
  core_amount numeric(30, 12);
  wallet_amount numeric(20, 2);
  inserted boolean;
begin
  for account in
    select user_id, balance, reinvest_percent
    from public.core_accounts
    order by user_id
  loop
    gross_amount := account.balance * daily_rate;
    core_amount := gross_amount * (account.reinvest_percent / 100);
    wallet_amount := round(gross_amount - core_amount, 2);
    inserted := false;

    insert into public.daily_core_accruals (
      accrual_date,
      user_id,
      core_before,
      daily_rate,
      gross_amount,
      reinvest_percent,
      core_amount,
      wallet_amount,
      core_after
    )
    values (
      p_accrual_date,
      account.user_id,
      account.balance,
      daily_rate,
      gross_amount,
      account.reinvest_percent,
      core_amount,
      wallet_amount,
      account.balance + core_amount
    )
    on conflict (accrual_date, user_id) do nothing
    returning true into inserted;

    if coalesce(inserted, false) then
      if core_amount > 0 then
        update public.core_accounts
        set balance = balance + core_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;

      if wallet_amount > 0 then
        update public.wallet_accounts
        set balance = balance + wallet_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.settle_team_bonus_for_member(
  p_member_user_id uuid,
  p_bonus_date date default ((now() at time zone 'utc')::date),
  p_settlement_kind text default 'daily',
  p_batch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  membership public.team_memberships%rowtype;
  source_core_after numeric(30, 12);
  source_core_delta numeric(30, 12);
  reward_amount numeric(20, 2);
  inserted_reward_id uuid;
begin
  if p_settlement_kind not in ('daily', 'leader_change') then
    raise exception 'Invalid team bonus settlement kind: %', p_settlement_kind;
  end if;

  select *
  into membership
  from public.team_memberships
  where member_user_id = p_member_user_id
    and is_active
  for update;

  if membership.member_user_id is null then
    return;
  end if;

  select balance
  into source_core_after
  from public.core_accounts
  where user_id = p_member_user_id
  for update;

  if source_core_after is null then
    return;
  end if;

  if membership.leader_user_id is null then
    update public.team_memberships
    set team_bonus_base_balance = source_core_after,
        team_bonus_base_at = now()
    where member_user_id = p_member_user_id
      and is_active;
    return;
  end if;

  source_core_delta := source_core_after - membership.team_bonus_base_balance;

  if source_core_delta <= 0 then
    update public.team_memberships
    set team_bonus_base_balance = source_core_after,
        team_bonus_base_at = now()
    where member_user_id = p_member_user_id
      and is_active;
    return;
  end if;

  reward_amount := round(source_core_delta * 0.10, 2);

  if reward_amount > 0 then
    insert into public.team_core_growth_rewards (
      bonus_date,
      source_user_id,
      leader_user_id,
      source_core_before,
      source_core_after,
      source_core_delta,
      reward_amount,
      settlement_kind,
      depth,
      batch_id
    )
    values (
      p_bonus_date,
      p_member_user_id,
      membership.leader_user_id,
      membership.team_bonus_base_balance,
      source_core_after,
      source_core_delta,
      reward_amount,
      p_settlement_kind,
      1,
      p_batch_id
    )
    on conflict do nothing
    returning id into inserted_reward_id;

    if inserted_reward_id is not null then
      update public.core_accounts
      set balance = balance + reward_amount,
          updated_at = now()
      where user_id = membership.leader_user_id;
    end if;
  end if;

  update public.team_memberships
  set team_bonus_base_balance = source_core_after,
      team_bonus_base_at = now()
  where member_user_id = p_member_user_id
    and is_active;
end;
$$;

create or replace function public.run_daily_team_bonus(
  p_bonus_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_record record;
  batch_id uuid := gen_random_uuid();
begin
  for member_record in
    select membership.member_user_id
    from public.team_memberships membership
    join public.user_profiles profile
      on profile.user_id = membership.member_user_id
    where membership.is_active
    order by profile.level asc, membership.assigned_at asc
  loop
    perform public.settle_team_bonus_for_member(member_record.member_user_id, p_bonus_date, 'daily', batch_id);
  end loop;
end;
$$;

create or replace function public.revalidate_team_membership_for_level_change(
  p_member_user_id uuid,
  p_member_level integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_membership public.team_memberships%rowtype;
  member_level integer;
  leader_level integer;
begin
  select *
  into active_membership
  from public.team_memberships
  where member_user_id = p_member_user_id
    and is_active
  for update;

  if active_membership.member_user_id is null then
    return;
  end if;

  if active_membership.leader_user_id is null then
    return;
  end if;

  member_level := p_member_level;

  if member_level is null then
    select level
    into member_level
    from public.user_profiles
    where user_id = p_member_user_id;
  end if;

  select level
  into leader_level
  from public.user_profiles
  where user_id = active_membership.leader_user_id;

  if member_level is null or leader_level is null then
    return;
  end if;

  if leader_level > member_level then
    return;
  end if;

  perform public.settle_team_bonus_for_member(
    p_member_user_id,
    ((now() at time zone 'utc')::date),
    'leader_change',
    null
  );

  update public.team_memberships
  set leader_user_id = null,
      assigned_at = now(),
      is_active = true,
      team_bonus_base_balance = (
        select balance::numeric(30, 12)
        from public.core_accounts
        where user_id = p_member_user_id
      ),
      team_bonus_base_at = now()
  where member_user_id = p_member_user_id
    and is_active;
end;
$$;

create or replace function public.run_daily_core_and_team_bonus(
  p_run_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('open_abundance_daily_core_and_team_bonus')) then
    return;
  end if;

  perform public.run_daily_core_accrual(p_run_date);
  perform public.run_daily_team_bonus(p_run_date);
end;
$$;

revoke all on function public.run_daily_core_accrual(date) from public, anon, authenticated;
revoke all on function public.settle_team_bonus_for_member(uuid, date, text, uuid) from public, anon, authenticated;
revoke all on function public.run_daily_team_bonus(date) from public, anon, authenticated;
revoke all on function public.revalidate_team_membership_for_level_change(uuid, integer) from public, anon, authenticated;
revoke all on function public.run_daily_core_and_team_bonus(date) from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'open-abundance-daily-core-team-bonus'
  ) then
    perform cron.unschedule('open-abundance-daily-core-team-bonus');
  end if;
end;
$$;

select cron.schedule(
  'open-abundance-daily-core-team-bonus',
  '0 0 * * *',
  $$select public.run_daily_core_and_team_bonus(((now() at time zone 'utc')::date));$$
);
