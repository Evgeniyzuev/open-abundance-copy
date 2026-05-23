create table if not exists public.recommended_wishes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_url text not null,
  category text not null,
  estimated_cost text,
  difficulty_level integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.recommended_wishes enable row level security;

drop policy if exists "Recommended wishes are readable by everyone" on public.recommended_wishes;

create policy "Recommended wishes are readable by everyone"
on public.recommended_wishes
for select
using (true);

insert into public.recommended_wishes (id, title, description, image_url, category, estimated_cost, difficulty_level)
values
  ('04d8a11f-113c-4735-9c9e-4c531dc68767', 'Better Shape', 'Inspire yourself to be the best version', 'https://i.pinimg.com/736x/4d/46/0e/4d460eac7c5aad2bc88b588b2273011f.jpg', 'Self', '$2000', 14),
  ('3e2e3e55-c97c-4f44-9ca9-c2ceca79b926', 'Learn to Surf', 'Catch the waves and enjoy the ocean.', 'https://i.pinimg.com/1200x/8e/4f/89/8e4f89402ddc403b8005a2f34b291c5d.jpg', 'Sports', '$3000', 15),
  ('4532af6d-87b4-4d1c-83b7-c14e0efad135', 'Learn Spanish', 'Master the Spanish language to communicate with millions.', 'https://i.pinimg.com/1200x/22/9f/01/229f01146be06f6e5cc6c72f8450af4e.jpg', 'Education', '$5000', 16),
  ('6d352717-ad73-4f9e-b4bc-663c4f445f34', 'Family', 'Be with your family', 'https://i.pinimg.com/736x/df/26/eb/df26eb53b86f3ad7e139010e32599a00.jpg', 'Relations', null, 15),
  ('721d819a-18db-45c8-ade2-c3a406809130', 'Mindfulness', 'Being present in the now, aware of your thoughts, feelings and sensations.', 'https://i.pinimg.com/1200x/17/ea/e3/17eae315d73c72603ee92933e44b856d.jpg', 'Self', '$1000', 13),
  ('84b6e2df-7e0e-4589-84de-6fcc56f4a478', 'Launch your project', 'Create what you really want. And live it.', 'https://i.pinimg.com/1200x/10/05/30/10053028c0a9709fcf6831bd25236404.jpg', 'Creativity', null, 10),
  ('9cf14dff-1d55-42cf-acbb-1050a1522767', 'Run a Marathon', 'Train for and complete a full 42km marathon.', 'https://i.pinimg.com/1200x/84/78/24/8478240ba03a6c51342844efa625701b.jpg', 'Health', '$500', 10),
  ('a07ace75-fe16-4d50-bc06-af8e8c1eab07', 'Visit Japan', 'Experience the culture, food, and cherry blossoms of Japan.', 'https://i.pinimg.com/736x/4c/17/14/4c1714fa8e77cf488ce88dd1219c4196.jpg', 'Travel', '$3000', 15),
  ('db56ac4c-c27b-4682-bae7-b5f5268d8bf2', 'New Car', 'Drive what you love', 'https://i.pinimg.com/1200x/5b/4f/61/5b4f61d55c3f1687ed8f960f37bb3e36.jpg', 'Items', '$100,000', 19),
  ('df4ac358-5af1-48be-9212-daa144b2e54e', 'Diving', 'See the beauty of the underwater world with your own eyes.', 'https://i.pinimg.com/1200x/1f/5b/08/1f5b08fb249db6d371da768cfbe7816d.jpg', 'Experience', '$5000', 16),
  ('e3e36006-3f38-4ef9-a22f-3523759a269e', 'Buy a House', 'Purchase my dream home for my family.', 'https://i.pinimg.com/736x/0b/3b/03/0b3b03f620b75390926bb96a850d3a04.jpg', 'Finance', '$500,000', 21),
  ('e957048d-f03f-45c9-b298-1cf8b356a5dc', 'Travel', 'Visit where you always wanted to', 'https://i.pinimg.com/1200x/ec/92/7e/ec927e592be3152780053fd3bc3c13b5.jpg', 'Travel', '$5,000', 15)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  category = excluded.category,
  estimated_cost = excluded.estimated_cost,
  difficulty_level = excluded.difficulty_level;
