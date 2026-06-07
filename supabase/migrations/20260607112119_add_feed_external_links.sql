alter table public.feed_posts
drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
add constraint feed_posts_post_type_check
check (post_type in ('daily_progress', 'manual', 'external_link'));

create table if not exists public.feed_post_external_links (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  provider text not null check (provider in ('tiktok', 'instagram', 'telegram', 'youtube', 'x', 'website', 'unknown')),
  external_url text not null,
  external_post_id text,
  author_handle text,
  title text,
  caption text,
  thumbnail_url text,
  embed_status text not null default 'link_only' check (embed_status in ('link_only', 'available', 'blocked', 'failed')),
  relation text not null default 'source' check (relation in ('source', 'mirror')),
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, provider, external_url)
);

create index if not exists feed_post_external_links_post_id_idx
on public.feed_post_external_links (post_id);

create index if not exists feed_post_external_links_provider_external_post_id_idx
on public.feed_post_external_links (provider, external_post_id)
where external_post_id is not null;

create index if not exists feed_post_external_links_relation_idx
on public.feed_post_external_links (relation, created_at desc);

alter table public.feed_post_external_links enable row level security;

grant select, insert, update, delete on table public.feed_post_external_links to authenticated, service_role;

drop policy if exists "Users can read visible feed external links" on public.feed_post_external_links;
create policy "Users can read visible feed external links"
on public.feed_post_external_links
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.deleted_at is null
      and (
        post.author_user_id = (select auth.uid())
        or (
          post.status = 'published'
          and post.visibility = 'public'
        )
      )
  )
);

drop policy if exists "Users can insert own feed external links" on public.feed_post_external_links;
create policy "Users can insert own feed external links"
on public.feed_post_external_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can update own feed external links" on public.feed_post_external_links;
create policy "Users can update own feed external links"
on public.feed_post_external_links
for update
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.author_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete own feed external links" on public.feed_post_external_links;
create policy "Users can delete own feed external links"
on public.feed_post_external_links
for delete
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_external_links.post_id
      and post.author_user_id = (select auth.uid())
  )
);

drop trigger if exists touch_feed_post_external_links_updated_at on public.feed_post_external_links;
create trigger touch_feed_post_external_links_updated_at
before update on public.feed_post_external_links
for each row
execute function public.touch_updated_at();
