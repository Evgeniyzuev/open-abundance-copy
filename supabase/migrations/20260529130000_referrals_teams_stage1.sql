create table if not exists public.referral_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (user_id, code)
);

create table if not exists public.referral_edges (
  referral_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referral_code text references public.referral_codes(code),
  guest_id uuid,
  captured_at timestamptz,
  claimed_at timestamptz not null default now(),
  source text,
  check (referral_user_id <> referrer_user_id)
);

create table if not exists public.team_memberships (
  member_user_id uuid primary key references auth.users(id) on delete cascade,
  leader_user_id uuid references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  is_active boolean not null default true,
  check (leader_user_id is null or member_user_id <> leader_user_id)
);

create index if not exists referral_edges_referrer_user_id_idx
on public.referral_edges (referrer_user_id);

create index if not exists team_memberships_leader_user_id_idx
on public.team_memberships (leader_user_id);

create index if not exists team_memberships_is_active_idx
on public.team_memberships (is_active);

alter table public.referral_codes enable row level security;
alter table public.referral_edges enable row level security;
alter table public.team_memberships enable row level security;

drop policy if exists "Users can read own referral codes" on public.referral_codes;
create policy "Users can read own referral codes"
on public.referral_codes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own referral edges" on public.referral_edges;
create policy "Users can read own referral edges"
on public.referral_edges
for select
using (auth.uid() = referral_user_id or auth.uid() = referrer_user_id);

drop policy if exists "Users can read own team memberships" on public.team_memberships;
create policy "Users can read own team memberships"
on public.team_memberships
for select
using (auth.uid() = member_user_id or auth.uid() = leader_user_id);
