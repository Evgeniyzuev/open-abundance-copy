alter table public.user_profiles
add column if not exists bio text;

create table if not exists public.user_profile_visibility_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  link_type text not null default 'website',
  label text,
  url text not null,
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'team', 'contacts', 'private')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_contacts (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('manual', 'team_leader', 'team_member')),
  status text not null default 'active' check (status in ('active', 'pending', 'blocked', 'removed')),
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (owner_user_id, contact_user_id, source),
  check (owner_user_id <> contact_user_id)
);

create index if not exists user_profile_links_user_id_sort_order_idx
on public.user_profile_links (user_id, sort_order, created_at);

create index if not exists user_profile_links_visibility_idx
on public.user_profile_links (visibility);

create index if not exists user_contacts_contact_user_id_idx
on public.user_contacts (contact_user_id);

create index if not exists user_contacts_owner_status_idx
on public.user_contacts (owner_user_id, status, updated_at desc);

alter table public.user_profile_visibility_settings enable row level security;
alter table public.user_profile_links enable row level security;
alter table public.user_contacts enable row level security;

grant select, insert, update, delete on table public.user_profile_visibility_settings to authenticated, service_role;
grant select, insert, update, delete on table public.user_profile_links to authenticated, service_role;
grant select, insert, update, delete on table public.user_contacts to authenticated, service_role;

drop policy if exists "Users can read own profile visibility settings" on public.user_profile_visibility_settings;
create policy "Users can read own profile visibility settings"
on public.user_profile_visibility_settings
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own profile visibility settings" on public.user_profile_visibility_settings;
create policy "Users can insert own profile visibility settings"
on public.user_profile_visibility_settings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own profile visibility settings" on public.user_profile_visibility_settings;
create policy "Users can update own profile visibility settings"
on public.user_profile_visibility_settings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read visible profile links" on public.user_profile_links;
create policy "Users can read visible profile links"
on public.user_profile_links
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or visibility = 'public'
  or (
    visibility = 'contacts'
    and exists (
      select 1
      from public.user_contacts c
      where c.owner_user_id = user_profile_links.user_id
        and c.contact_user_id = (select auth.uid())
        and c.status = 'active'
    )
  )
  or (
    visibility = 'team'
    and exists (
      select 1
      from public.team_memberships tm
      where tm.is_active
        and (
          (tm.member_user_id = user_profile_links.user_id and tm.leader_user_id = (select auth.uid()))
          or (tm.leader_user_id = user_profile_links.user_id and tm.member_user_id = (select auth.uid()))
        )
    )
  )
);

drop policy if exists "Users can insert own profile links" on public.user_profile_links;
create policy "Users can insert own profile links"
on public.user_profile_links
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own profile links" on public.user_profile_links;
create policy "Users can update own profile links"
on public.user_profile_links
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own profile links" on public.user_profile_links;
create policy "Users can delete own profile links"
on public.user_profile_links
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own contacts" on public.user_contacts;
create policy "Users can read own contacts"
on public.user_contacts
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists "Users can insert manual contacts" on public.user_contacts;
create policy "Users can insert manual contacts"
on public.user_contacts
for insert
to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and source = 'manual'
  and not is_required
);

drop policy if exists "Users can update manual contacts" on public.user_contacts;
create policy "Users can update manual contacts"
on public.user_contacts
for update
to authenticated
using (
  (select auth.uid()) = owner_user_id
  and source = 'manual'
  and not is_required
)
with check (
  (select auth.uid()) = owner_user_id
  and source = 'manual'
  and not is_required
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_user_profile_visibility_settings_updated_at on public.user_profile_visibility_settings;
create trigger touch_user_profile_visibility_settings_updated_at
before update on public.user_profile_visibility_settings
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_user_profile_links_updated_at on public.user_profile_links;
create trigger touch_user_profile_links_updated_at
before update on public.user_profile_links
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_user_contacts_updated_at on public.user_contacts;
create trigger touch_user_contacts_updated_at
before update on public.user_contacts
for each row
execute function public.touch_updated_at();

create or replace function public.sync_team_contacts_for_member(p_member_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_membership public.team_memberships%rowtype;
begin
  select *
  into active_membership
  from public.team_memberships
  where member_user_id = p_member_user_id
    and is_active
  limit 1;

  update public.user_contacts contact
  set status = 'removed',
      is_required = false,
      removed_at = coalesce(removed_at, now()),
      updated_at = now()
  where contact.source = 'team_leader'
    and contact.owner_user_id = p_member_user_id
    and contact.status = 'active'
    and (
      active_membership.member_user_id is null
      or active_membership.leader_user_id is null
      or contact.contact_user_id <> active_membership.leader_user_id
    );

  update public.user_contacts contact
  set status = 'removed',
      is_required = false,
      removed_at = coalesce(removed_at, now()),
      updated_at = now()
  where contact.source = 'team_member'
    and contact.contact_user_id = p_member_user_id
    and contact.status = 'active'
    and not exists (
      select 1
      from public.team_memberships membership
      where membership.is_active
        and membership.member_user_id = contact.contact_user_id
        and membership.leader_user_id = contact.owner_user_id
    );

  if active_membership.member_user_id is null or active_membership.leader_user_id is null then
    return;
  end if;

  insert into public.user_contacts (owner_user_id, contact_user_id, source, status, is_required, removed_at)
  values
    (active_membership.member_user_id, active_membership.leader_user_id, 'team_leader', 'active', true, null),
    (active_membership.leader_user_id, active_membership.member_user_id, 'team_member', 'active', true, null)
  on conflict (owner_user_id, contact_user_id, source)
  do update
  set status = 'active',
      is_required = true,
      removed_at = null,
      updated_at = now();
end;
$$;

create or replace function public.sync_team_contacts_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_team_contacts_for_member(coalesce(new.member_user_id, old.member_user_id));
  return new;
end;
$$;

drop trigger if exists sync_team_contacts_after_membership_change on public.team_memberships;
create trigger sync_team_contacts_after_membership_change
after insert or update of leader_user_id, is_active on public.team_memberships
for each row
execute function public.sync_team_contacts_after_membership_change();

do $$
declare
  membership record;
begin
  for membership in
    select member_user_id
    from public.team_memberships
    where is_active
  loop
    perform public.sync_team_contacts_for_member(membership.member_user_id);
  end loop;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.sync_team_contacts_for_member(uuid) from public, anon, authenticated;
revoke all on function public.sync_team_contacts_after_membership_change() from public, anon, authenticated;
