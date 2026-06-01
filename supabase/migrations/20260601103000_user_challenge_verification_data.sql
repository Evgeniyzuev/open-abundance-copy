alter table public.user_challenges
add column if not exists verification_data jsonb not null default '{}'::jsonb;
