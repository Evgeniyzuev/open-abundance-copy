alter table public.challenges
add column if not exists verification_logic text;

update public.challenges
set
  reward_label = '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  difficulty_level = 0,
  sort_order = 10,
  verification_logic = 'signup'
where title->>'en' = 'Save Your Progress';

update public.challenges
set
  reward_label = '{"en":"⚛️+3$","ru":"⚛️+3$"}'::jsonb,
  difficulty_level = 2
where title->>'en' = 'Three Days Of Focus';

delete from public.challenges
where title->>'en' in (
  'Add Your First Wish',
  'Ask for AI Recommendations',
  'Calculate Time to Goal',
  'App Testing',
  'Invite a Friend'
);

insert into public.challenges (
  id,
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
  verification_logic,
  sort_order
) values
(
  '87a8062d-21ce-4edb-a71f-320c68959da6',
  '{"en":"Add Your First Wish","ru":"Добавьте свое первое желание"}'::jsonb,
  '{"en":"Create your vision board by adding your first wish. What would you like to achieve?","ru":"Создайте свою доску желаний, добавив первое желание. Чего вы хотите достичь?"}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'goal_setting',
  1,
  1,
  'https://i.pinimg.com/736x/a4/07/3e/a4073ec37f5c076eb98316fce297e7ca.jpg',
  'auto',
  'has_wish',
  20
),
(
  '42cbacd1-d666-490b-9c4c-f7a8ab5e6299',
  '{"en":"Ask for AI Recommendations","ru":"Спросить рекомендации у AI"}'::jsonb,
  '{"en":"Take the first step towards abundance by asking our AI assistant for personalized recommendations. The AI Abundance Coordinator is here to help you grow your core capital and achieve your goals.","ru":"Сделайте первый шаг к изобилию, попросив персональные рекомендации у нашего AI-ассистента. AI Координатор Изобилия здесь, чтобы помочь вам увеличить ваш основной капитал и достичь целей."}'::jsonb,
  '{"en":"1. Go to AI tab\n2. Send a message asking for recommendations\n3. Receive AI response","ru":"1. Перейдите во вкладку AI\n2. Отправьте сообщение с просьбой о рекомендациях\n3. Получите ответ от AI"}'::jsonb,
  '{"en":"Send one message to the AI assistant and receive a response","ru":"Отправьте одно сообщение AI-ассистенту и получите ответ"}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'ai_assistant',
  1,
  1,
  'https://i.pinimg.com/736x/86/7e/2c/867e2cf2156873ec3d7a26c0e0791699.jpg',
  'auto',
  'ai_message_sent',
  30
),
(
  '69ce2255-6676-4541-9a0f-5fe13b94c22c',
  '{"en":"Calculate Time to Goal","ru":"Рассчитать срок до цели"}'::jsonb,
  '{"en":"Your life tomorrow is the result of your financial goals today. Calculate how soon you will become financially free with the help of AI and the Abundance system. Your future starts with one calculation.","ru":"Твоя прошлая жизнь была уроком, а будущее — это чистый холст, который ты начинаешь закрашивать золотом прямо сейчас. Рассчитай дату, когда твой капитал начнет работать на тебя 24/7, обеспечивая свободу передвижения, лучшие отели мира и возможность помогать близким. Это не просто цифры, это план твоего триумфа в программе Изобилия."}'::jsonb,
  '{"en":"1. Go to Wallet tab\n2. Open Core section\n3. Enter your target capital amount\n4. Click Calculate button","ru":"1. Перейдите во вкладку Кошелек\n2. Откройте раздел Ядро\n3. Введите сумму вашего целевого капитала\n4. Нажмите кнопку Рассчитать"}'::jsonb,
  '{"en":"Use the calculator in the Wallet Core section","ru":"Воспользуйтесь калькулятором в разделе Ядро Кошелька"}'::jsonb,
  '{"en":"⚛️+1$","ru":"⚛️+1$"}'::jsonb,
  'finance',
  1,
  1,
  'https://i.pinimg.com/736x/29/10/1a/29101a03f017acfd6659c22d8fc8aaea.jpg',
  'auto',
  'calculate_time_to_goal',
  40
),
(
  '03bfd7f2-6d8e-414a-a925-1181424eab45',
  '{"en":"App Testing","ru":"Тестирование приложения"}'::jsonb,
  '{"en":"Explore all tabs and write a detailed review to help us improve.","ru":"Прокликайте все вкладки и напишите развернутый отзыв о приложении."}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{"en":"⚛️+2$","ru":"⚛️+2$"}'::jsonb,
  'quality_assurance',
  2,
  1,
  'https://i.pinimg.com/1200x/31/12/d4/3112d4847148fa089529b553884e3f41.jpg',
  'auto',
  'app_testing',
  80
),
(
  '1b520e42-d5d2-4eb1-81bf-c16d12d4e246',
  '{"en":"Invite a Friend","ru":"Пригласить друга"}'::jsonb,
  '{"en":"Invite 1 friend to your team to unlock your potential.","ru":"Пригласите 1 друга в команду, чтобы раскрыть потенциал."}'::jsonb,
  '{"en":"1. Go to Social tab.\n2. Click Invite Friend.\n3. Share your link.\n4. Wait for them to join.\n5. Come back and click Check.","ru":"1. Перейдите в Социум.\n2. Нажмите Пригласить.\n3. Отправьте ссылку.\n4. Дождитесь регистрации.\n5. Вернитесь и нажмите Проверить."}'::jsonb,
  '{}'::jsonb,
  '{"en":"⚛️+2$","ru":"⚛️+2$"}'::jsonb,
  'social',
  2,
  1,
  'https://i.pinimg.com/736x/18/49/01/18490141a64d79f09f1b7e8c54c2ae2a.jpg',
  'auto',
  'has_referral',
  100
);
