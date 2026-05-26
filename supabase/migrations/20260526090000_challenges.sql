create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  instructions jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  reward_label jsonb not null default '{}'::jsonb,
  category text not null default 'general',
  difficulty_level integer not null default 1,
  duration_days integer,
  image_url text,
  verification_type text not null default 'manual' check (verification_type in ('auto', 'manual', 'community')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

drop policy if exists "Everyone can view active challenges" on public.challenges;
create policy "Everyone can view active challenges"
on public.challenges
for select
using (is_active = true);

create index if not exists idx_challenges_active_sort
on public.challenges (is_active, sort_order, difficulty_level, created_at);

insert into public.challenges (
  title,
  description,
  instructions,
  requirements,
  reward_label,
  category,
  difficulty_level,
  duration_days,
  image_url,
  verification_type,
  sort_order
) values
(
  '{"en":"Save Your Progress","ru":"Сохрани прогресс"}'::jsonb,
  '{"en":"Create an account so your notes, tasks and wishes can be restored on another device.","ru":"Создай аккаунт, чтобы заметки, задачи и желания можно было восстановить на другом устройстве."}'::jsonb,
  '{"en":"Register with email, Google or Telegram. Phone verification can unlock an extra bonus later.","ru":"Зарегистрируйся через почту, Google или Telegram. Подтверждение телефона позже может открыть дополнительный бонус."}'::jsonb,
  '{"en":"Finish registration and keep your local data linked to your profile.","ru":"Заверши регистрацию и привяжи локальные данные к профилю."}'::jsonb,
  '{"en":"+1 signup bonus preview","ru":"+1 preview-бонус за регистрацию"}'::jsonb,
  'onboarding',
  1,
  1,
  'https://i.pinimg.com/736x/a4/07/3e/a4073ec37f5c076eb98316fce297e7ca.jpg',
  'auto',
  10
),
(
  '{"en":"Add Your First Wish","ru":"Добавь первое желание"}'::jsonb,
  '{"en":"Start your wishboard with one clear wish that you really want.","ru":"Начни доску желаний с одного ясного желания, которое тебе действительно важно."}'::jsonb,
  '{"en":"Open Goals, add a wish, then return to Challenges to continue.","ru":"Открой цели, добавь желание, затем вернись в челленджи, чтобы продолжить."}'::jsonb,
  '{"en":"At least one personal wish exists locally or on the server.","ru":"Есть хотя бы одно личное желание локально или на сервере."}'::jsonb,
  '{"en":"+1 core","ru":"+1 ядро"}'::jsonb,
  'goals',
  1,
  1,
  'https://i.pinimg.com/736x/0b/3b/03/0b3b03f620b75390926bb96a850d3a04.jpg',
  'auto',
  20
),
(
  '{"en":"Three Days Of Focus","ru":"Три дня фокуса"}'::jsonb,
  '{"en":"Choose one meaningful daily action and complete it for three days.","ru":"Выбери одно важное ежедневное действие и выполни его три дня подряд."}'::jsonb,
  '{"en":"Create a daily check in Goals > Checks and mark it done for three days.","ru":"Создай ежедневную задачу в Цели > Checks и отмечай выполнение три дня."}'::jsonb,
  '{"en":"Three completion events for one daily task.","ru":"Три отметки выполнения у одной ежедневной задачи."}'::jsonb,
  '{"en":"+3 core","ru":"+3 ядра"}'::jsonb,
  'focus',
  2,
  3,
  'https://i.pinimg.com/1200x/84/78/24/8478240ba03a6c51342844efa625701b.jpg',
  'auto',
  30
)
on conflict (id) do nothing;
