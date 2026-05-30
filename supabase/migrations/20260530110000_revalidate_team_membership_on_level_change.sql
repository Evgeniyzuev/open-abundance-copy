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

create or replace function public.update_core_level()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  previous_level integer;
begin
  previous_level := case
    when tg_op = 'UPDATE' then coalesce(old.level, 0)
    else 0
  end;
  new.level := public.calculate_core_level(new.balance);
  new.updated_at := now();

  update public.user_profiles
  set level = new.level,
      updated_at = now()
  where user_id = new.user_id
    and level is distinct from new.level;

  if new.level is distinct from previous_level then
    perform public.revalidate_team_membership_for_level_change(new.user_id, new.level);
  end if;

  return new;
end;
$$;

do $$
declare
  invalid_membership record;
begin
  for invalid_membership in
    select membership.member_user_id
    from public.team_memberships membership
    join public.user_profiles member_profile
      on member_profile.user_id = membership.member_user_id
    join public.user_profiles leader_profile
      on leader_profile.user_id = membership.leader_user_id
    where membership.is_active
      and membership.leader_user_id is not null
      and leader_profile.level <= member_profile.level
  loop
    perform public.revalidate_team_membership_for_level_change(invalid_membership.member_user_id);
  end loop;
end;
$$;
