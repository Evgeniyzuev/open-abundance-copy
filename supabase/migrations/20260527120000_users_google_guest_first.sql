create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  first_name text,
  last_name text,
  display_name text,
  avatar_url text,
  default_locale text not null default 'ru',
  timezone text,
  onboarding_state jsonb not null default '{}'::jsonb,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.core_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20, 2) not null default 0 check (balance >= 0),
  level integer not null default 0 check (level >= 0),
  reinvest_percent numeric(5, 2) not null default 0 check (reinvest_percent >= 0 and reinvest_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(20, 2) not null default 0 check (balance >= 0),
  currency_code text not null default 'OA$',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.core_accounts enable row level security;
alter table public.wallet_accounts enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own core account" on public.core_accounts;
create policy "Users can read own core account"
on public.core_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own wallet account" on public.wallet_accounts;
create policy "Users can read own wallet account"
on public.wallet_accounts
for select
using (auth.uid() = user_id);

update public.challenges
set
  description = '{"en":"Sign in with Google so your local progress can be linked to a durable profile.","ru":"Войдите через Google, чтобы локальный прогресс можно было привязать к постоянному профилю."}'::jsonb,
  instructions = '{"en":"Tap Google sign-in. After the callback, the app will create your profile, Core and Wallet.","ru":"Нажмите вход через Google. После возврата приложение создаст профиль, Core и Wallet."}'::jsonb,
  requirements = '{"en":"Complete Google sign-in from this device.","ru":"Завершите вход через Google с этого устройства."}'::jsonb,
  verification_logic = 'signup',
  difficulty_level = 0
where title->>'en' = 'Save Your Progress';
