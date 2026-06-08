alter table public.feed_posts
drop constraint if exists feed_posts_post_type_check;

alter table public.feed_posts
add constraint feed_posts_post_type_check
check (post_type in ('daily_progress', 'manual', 'external_link', 'wish'));

create table if not exists public.feed_post_entities (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  relation text not null default 'primary',
  created_at timestamptz not null default now(),
  constraint feed_post_entities_entity_type_check check (entity_type in ('wish')),
  constraint feed_post_entities_relation_check check (relation in ('primary'))
);

create unique index if not exists feed_post_entities_unique_relation_idx
on public.feed_post_entities (post_id, entity_type, entity_id, relation);

create unique index if not exists feed_post_entities_unique_primary_wish_idx
on public.feed_post_entities (entity_type, entity_id, relation)
where entity_type = 'wish' and relation = 'primary';

create index if not exists feed_post_entities_post_id_idx
on public.feed_post_entities (post_id);

create index if not exists feed_post_entities_entity_idx
on public.feed_post_entities (entity_type, entity_id);

alter table public.feed_post_entities enable row level security;

grant select, insert, update, delete on table public.feed_post_entities to authenticated, service_role;

drop policy if exists "Users can read visible feed entities" on public.feed_post_entities;
create policy "Users can read visible feed entities"
on public.feed_post_entities
for select
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_entities.post_id
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

drop policy if exists "Users can insert own feed entities" on public.feed_post_entities;
create policy "Users can insert own feed entities"
on public.feed_post_entities
for insert
to authenticated
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_entities.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can update own feed entities" on public.feed_post_entities;
create policy "Users can update own feed entities"
on public.feed_post_entities
for update
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_entities.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_entities.post_id
      and post.author_user_id = (select auth.uid())
      and post.deleted_at is null
  )
);

drop policy if exists "Users can delete own feed entities" on public.feed_post_entities;
create policy "Users can delete own feed entities"
on public.feed_post_entities
for delete
to authenticated
using (
  exists (
    select 1
    from public.feed_posts post
    where post.id = feed_post_entities.post_id
      and post.author_user_id = (select auth.uid())
  )
);
