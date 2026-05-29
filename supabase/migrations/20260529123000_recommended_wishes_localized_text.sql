alter table public.recommended_wishes
  alter column description drop default;

alter table public.recommended_wishes
  alter column title type jsonb using jsonb_build_object('en', title, 'ru', title),
  alter column description type jsonb using jsonb_build_object('en', description, 'ru', description),
  alter column title set default '{"en":"","ru":""}'::jsonb,
  alter column description set default '{"en":"","ru":""}'::jsonb;

update public.recommended_wishes
set
  title = '{"en":"Better Shape","ru":"Лучшая форма"}'::jsonb,
  description = '{"en":"Inspire yourself to be the best version","ru":"Вдохнови себя стать лучшей версией себя."}'::jsonb
where id = '04d8a11f-113c-4735-9c9e-4c531dc68767';

update public.recommended_wishes
set
  title = '{"en":"Learn to Surf","ru":"Научиться серфингу"}'::jsonb,
  description = '{"en":"Catch the waves and enjoy the ocean.","ru":"Лови волны и наслаждайся океаном."}'::jsonb
where id = '3e2e3e55-c97c-4f44-9ca9-c2ceca79b926';

update public.recommended_wishes
set
  title = '{"en":"Learn Spanish","ru":"Выучить испанский"}'::jsonb,
  description = '{"en":"Master the Spanish language to communicate with millions.","ru":"Освой испанский язык, чтобы общаться с миллионами людей."}'::jsonb
where id = '4532af6d-87b4-4d1c-83b7-c14e0efad135';

update public.recommended_wishes
set
  title = '{"en":"Family","ru":"Семья"}'::jsonb,
  description = '{"en":"Be with your family","ru":"Быть рядом со своей семьей."}'::jsonb
where id = '6d352717-ad73-4f9e-b4bc-663c4f445f34';

update public.recommended_wishes
set
  title = '{"en":"Mindfulness","ru":"Осознанность"}'::jsonb,
  description = '{"en":"Being present in the now, aware of your thoughts, feelings and sensations.","ru":"Быть в настоящем моменте, осознавая свои мысли, чувства и ощущения."}'::jsonb
where id = '721d819a-18db-45c8-ade2-c3a406809130';

update public.recommended_wishes
set
  title = '{"en":"Launch your project","ru":"Запустить свой проект"}'::jsonb,
  description = '{"en":"Create what you really want. And live it.","ru":"Создай то, чего действительно хочешь, и живи этим."}'::jsonb
where id = '84b6e2df-7e0e-4589-84de-6fcc56f4a478';

update public.recommended_wishes
set
  title = '{"en":"Run a Marathon","ru":"Пробежать марафон"}'::jsonb,
  description = '{"en":"Train for and complete a full 42km marathon.","ru":"Подготовься и пробеги полный марафон 42 км."}'::jsonb
where id = '9cf14dff-1d55-42cf-acbb-1050a1522767';

update public.recommended_wishes
set
  title = '{"en":"Visit Japan","ru":"Посетить Японию"}'::jsonb,
  description = '{"en":"Experience the culture, food, and cherry blossoms of Japan.","ru":"Познакомься с культурой, кухней и цветением сакуры в Японии."}'::jsonb
where id = 'a07ace75-fe16-4d50-bc06-af8e8c1eab07';

update public.recommended_wishes
set
  title = '{"en":"New Car","ru":"Новая машина"}'::jsonb,
  description = '{"en":"Drive what you love","ru":"Води то, что любишь."}'::jsonb
where id = 'db56ac4c-c27b-4682-bae7-b5f5268d8bf2';

update public.recommended_wishes
set
  title = '{"en":"Diving","ru":"Дайвинг"}'::jsonb,
  description = '{"en":"See the beauty of the underwater world with your own eyes.","ru":"Увидь красоту подводного мира своими глазами."}'::jsonb
where id = 'df4ac358-5af1-48be-9212-daa144b2e54e';

update public.recommended_wishes
set
  title = '{"en":"Buy a House","ru":"Купить дом"}'::jsonb,
  description = '{"en":"Purchase my dream home for my family.","ru":"Купить дом мечты для своей семьи."}'::jsonb
where id = 'e3e36006-3f38-4ef9-a22f-3523759a269e';

update public.recommended_wishes
set
  title = '{"en":"Travel","ru":"Путешествие"}'::jsonb,
  description = '{"en":"Visit where you always wanted to","ru":"Посети место, куда всегда хотел попасть."}'::jsonb
where id = 'e957048d-f03f-45c9-b298-1cf8b356a5dc';
