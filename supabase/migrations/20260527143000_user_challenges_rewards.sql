create table if not exists public.user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted', 'completed', 'declined', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, challenge_id)
);

create index if not exists idx_user_challenges_user_status
on public.user_challenges (user_id, status, updated_at);

alter table public.user_challenges enable row level security;

drop policy if exists "Users can read own challenge progress" on public.user_challenges;
create policy "Users can read own challenge progress"
on public.user_challenges
for select
using (auth.uid() = user_id);

create or replace function public.complete_user_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_reward_account text,
  p_reward_amount numeric
)
returns table (
  challenge_status text,
  reward_claimed boolean,
  rewarded_account text,
  rewarded_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_status text;
begin
  insert into public.user_challenges (user_id, challenge_id, status, updated_at)
  values (p_user_id, p_challenge_id, 'accepted', now())
  on conflict (user_id, challenge_id) do update
  set updated_at = now();

  select status
  into existing_status
  from public.user_challenges
  where user_id = p_user_id and challenge_id = p_challenge_id
  for update;

  if existing_status = 'completed' then
    return query select 'completed'::text, false, p_reward_account, p_reward_amount;
    return;
  end if;

  if p_reward_account = 'core' and p_reward_amount > 0 then
    update public.core_accounts
    set balance = balance + p_reward_amount,
        updated_at = now()
    where user_id = p_user_id;
  elsif p_reward_account = 'wallet' and p_reward_amount > 0 then
    update public.wallet_accounts
    set balance = balance + p_reward_amount,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  update public.user_challenges
  set status = 'completed',
      updated_at = now()
  where user_id = p_user_id and challenge_id = p_challenge_id;

  return query select 'completed'::text, true, p_reward_account, p_reward_amount;
end;
$$;
