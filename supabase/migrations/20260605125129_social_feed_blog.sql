create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('daily_core_accrual')),
  source_date date not null,
  core_before numeric(18, 6),
  daily_rate numeric(12, 8),
  gross_amount numeric(18, 6),
  reinvest_percent numeric(8, 4),
  core_amount numeric(18, 6),
  wallet_amount numeric(18, 6),
  core_after numeric(18, 6),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_date)
);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_id uuid references public.progress_snapshots(id) on delete restrict,
  post_type text not null default 'daily_progress' check (post_type in ('daily_progress', 'manual')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'team', 'contacts', 'private')),
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  unique (author_user_id, snapshot_id)
);

create table if not exists public.feed_post_stat_blocks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  snapshot_id uuid not null references public.progress_snapshots(id) on delete restrict,
  block_key text not null check (block_key in ('core_growth', 'wallet_income', 'daily_rate', 'reinvest')),
  label text not null,
  value jsonb not null default '{}'::jsonb,
  visibility text not null default 'private' check (visibility in ('public', 'followers', 'team', 'contacts', 'private')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, block_key)
);

create index if not exists progress_snapshots_user_source_date_idx
on public.progress_snapshots (user_id, source_type, source_date desc);

create index if not exists feed_posts_public_feed_idx
on public.feed_posts (published_at desc, created_at desc)
where status = 'published' and visibility = 'public' and deleted_at is null;

create index if not exists feed_posts_author_status_idx
on public.feed_posts (author_user_id, status, created_at desc)
where deleted_at is null;

create index if not exists feed_posts_snapshot_id_idx
on public.feed_posts (snapshot_id);

create index if not exists feed_post_stat_blocks_post_visibility_idx
on public.feed_post_stat_blocks (post_id, visibility, sort_order);

alter table public.progress_snapshots enable row level security;
alter table public.feed_posts enable row level security;
alter table public.feed_post_stat_blocks enable row level security;

grant select, insert, update, delete on table public.progress_snapshots to authenticated, service_role;
grant select, insert, update, delete on table public.feed_posts to authenticated, service_role;
grant select, insert, update, delete on table public.feed_post_stat_blocks to authenticated, service_role;

drop policy if exists "Users can read own progress snapshots" on public.progress_snapshots;
create policy "Users can read own progress snapshots"
on public.progress_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own progress snapshots" on public.progress_snapshots;
create policy "Users can insert own progress snapshots"
on public.progress_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own progress snapshots" on public.progress_snapshots;
create policy "Users can update own progress snapshots"
on public.progress_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read visible feed posts" on public.feed_posts;
create policy "Users can read visible feed posts"
on public.feed_posts
for select
to authenticated
using (
  deleted_at is null
  and (
    (select auth.uid()) = author_user_id
    or (status = 'published' and visibility = 'public')
  )
);

drop policy if exists "Users can insert own feed posts" on public.feed_posts;
create policy "Users can insert own feed posts"
on public.feed_posts
for insert
to authenticated
with check ((select auth.uid()) = author_user_id);

drop policy if exists "Users can update own feed posts" on public.feed_posts;
create policy "Users can update own feed posts"
on public.feed_posts
for update
to authenticated
using ((select auth.uid()) = author_user_id)
with check ((select auth.uid()) = author_user_id);

drop policy if exists "Users can read visible feed stat blocks" on public.feed_post_stat_blocks;
create policy "Users can read visible feed stat blocks"
on public.feed_post_stat_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_stat_blocks.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (
          post.status = 'published'
          and post.visibility = 'public'
          and feed_post_stat_blocks.visibility = 'public'
        )
      )
  )
);

drop policy if exists "Users can insert own feed stat blocks" on public.feed_post_stat_blocks;
create policy "Users can insert own feed stat blocks"
on public.feed_post_stat_blocks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_stat_blocks.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update own feed stat blocks" on public.feed_post_stat_blocks;
create policy "Users can update own feed stat blocks"
on public.feed_post_stat_blocks
for update
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_stat_blocks.post_id
      and post.author_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_stat_blocks.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop trigger if exists touch_progress_snapshots_updated_at on public.progress_snapshots;
create trigger touch_progress_snapshots_updated_at
before update on public.progress_snapshots
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_feed_posts_updated_at on public.feed_posts;
create trigger touch_feed_posts_updated_at
before update on public.feed_posts
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_feed_post_stat_blocks_updated_at on public.feed_post_stat_blocks;
create trigger touch_feed_post_stat_blocks_updated_at
before update on public.feed_post_stat_blocks
for each row
execute function public.touch_updated_at();
