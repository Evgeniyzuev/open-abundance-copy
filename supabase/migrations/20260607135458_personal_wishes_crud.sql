create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text,
  image_url text,
  target_amount numeric(18,2),
  target_currency text not null default 'USD',
  difficulty_level integer not null default 1,
  status text not null default 'active',
  visibility text not null default 'private',
  source_recommended_wish_id uuid references public.recommended_wishes(id) on delete set null,
  cloned_from_wish_id uuid references public.wishes(id) on delete set null,
  original_wish_id uuid references public.wishes(id) on delete set null,
  copied_count integer not null default 0,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishes_title_not_blank check (length(btrim(title)) > 0),
  constraint wishes_target_amount_non_negative check (target_amount is null or target_amount >= 0),
  constraint wishes_target_currency_not_blank check (length(btrim(target_currency)) > 0),
  constraint wishes_difficulty_level_positive check (difficulty_level >= 1),
  constraint wishes_copied_count_non_negative check (copied_count >= 0),
  constraint wishes_status_check check (status in ('active', 'completed', 'archived')),
  constraint wishes_visibility_check check (visibility in ('private', 'public', 'team', 'contacts'))
);

create index if not exists wishes_owner_status_deleted_idx
  on public.wishes (owner_user_id, status, deleted_at);

create index if not exists wishes_visibility_status_deleted_idx
  on public.wishes (visibility, status, deleted_at);

create index if not exists wishes_source_recommended_wish_id_idx
  on public.wishes (source_recommended_wish_id);

create index if not exists wishes_cloned_from_wish_id_idx
  on public.wishes (cloned_from_wish_id);

create index if not exists wishes_original_wish_id_idx
  on public.wishes (original_wish_id);

alter table public.wishes enable row level security;

drop policy if exists "Wishes are readable by owner or authenticated public viewers." on public.wishes;
create policy "Wishes are readable by owner or authenticated public viewers."
on public.wishes
for select
to authenticated
using (
  deleted_at is null
  and (
    (select auth.uid()) = owner_user_id
    or (
      visibility = 'public'
      and status in ('active', 'completed')
    )
  )
);

drop policy if exists "Users can create their own wishes." on public.wishes;
create policy "Users can create their own wishes."
on public.wishes
for insert
to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and deleted_at is null
);

drop policy if exists "Users can update their own wishes." on public.wishes;
create policy "Users can update their own wishes."
on public.wishes
for update
to authenticated
using (
  deleted_at is null
  and (select auth.uid()) = owner_user_id
)
with check (
  (select auth.uid()) = owner_user_id
);

drop trigger if exists touch_wishes_updated_at on public.wishes;
create trigger touch_wishes_updated_at
before update on public.wishes
for each row
execute function public.touch_updated_at();

grant select, insert, update on table public.wishes to authenticated;
grant select, insert, update, delete on table public.wishes to service_role;
