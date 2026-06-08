# Wishes Implementation Plan

Документ нужен как самостоятельный стартовый контекст для реализации системы желаний в новом чате.

Желания - отдельный продуктовый домен Open Abundance. Они связывают цели пользователя, визуальный образ будущего, задачи, челленджи, прогресс Core и социальную ленту.

## Цель

Сделать так, чтобы пользователь мог:

- создать свое желание;
- выбрать желание из рекомендаций и адаптировать под себя;
- видеть активные, выполненные и архивные желания;
- делиться публичным желанием в ленте;
- копировать публичное желание другого пользователя себе и редактировать его под свою жизнь.

Для MVP желания должны быть полезны сами по себе, даже без полной социальной механики. Социальный слой добавляется вторым этапом.

## Что Уже Есть В Новом Проекте

В `open-abundance` уже есть:

- таблица `recommended_wishes`;
- API `app/api/recommended-wishes/route.ts`;
- компонент `components/RecommendedWishes.tsx`;
- экран Goals -> Desires, где сейчас показываются только рекомендованные желания;
- challenge condition `has_wish` в миграциях челленджей;
- планы в `docs/OPEN_ABUNDANCE_MASTER_PLAN.md` и `docs/FEED_POSTING_RECOMMENDATIONS_PLAN.md`, где желания уже считаются частью роста и ленты.

Чего еще нет:

- личной таблицы желаний пользователя;
- CRUD API для личных желаний;
- создания желания из UI;
- копирования рекомендованного или чужого желания;
- связи желания с feed post;
- проверки `has_wish` по серверным личным желаниям.

## Что Было В Старом Проекте

Старый проект `F:\git\abundance-effect` уже содержал рабочую основу:

- `supabase/migrations/0001_create_wishes_tables.sql`;
- `supabase/migrations/0002_add_recommended_source_id.sql`;
- `components/goals/Wishboard.tsx`;
- `components/AddWishModal.tsx`;
- `components/WishCard.tsx`;
- `components/WishDetailModal.tsx`;
- `components/WishCompletionModal.tsx`;
- `hooks/useGoals.ts`;
- `app/actions/goals.ts`;
- `types/supabase.ts`.

Старая модель:

- `user_wishes`: личные желания пользователя;
- `recommended_wishes`: общие рекомендованные желания;
- `recommended_source_id`: связь личного желания с рекомендованным источником;
- `is_completed`: выполнено или нет;
- `difficulty_level`, `estimated_cost`, `image_url`, `title`, `description`.

Что стоит перенести по смыслу:

- простую доску желаний с плитками;
- модалку создания/редактирования;
- модалку просмотра желания;
- действие "добавить себе";
- разделение активных, рекомендованных и выполненных желаний;
- optimistic UI, где это безопасно;
- локальный образ желания через картинку.

Что лучше улучшить:

- вместо `user_wishes` использовать имя `wishes`, потому что это основная сущность нового продукта;
- добавить `visibility`, чтобы желание могло быть приватным, публичным, командным или для контактов;
- добавить `status`, а не только `is_completed`;
- добавить поля происхождения для копирования чужих желаний;
- не загружать тяжелые медиа в Supabase Storage на первом шаге, чтобы не раздувать лимит 2 GB.

## Продуктовые Правила

1. Желание принадлежит одному владельцу.
2. Приватные желания видит только владелец.
3. Публичные желания можно показывать в профиле, блоге и ленте.
4. Копирование не делает shared ownership: у каждого пользователя появляется своя редактируемая копия.
5. Скопированное желание хранит ссылку на источник, но после копирования живет отдельно.
6. Рекомендованное желание - шаблон, а личное желание - намерение конкретного пользователя.
7. Feed post о желании - публикация, а не само желание.
8. Удаление поста не должно удалять желание.
9. Удаление или архивирование желания должно скрывать связанные wish-post CTA или показывать fallback "желание недоступно".

## MVP Data Model

### `wishes`

Основная таблица личных желаний.

Поля:

- `id uuid primary key`;
- `owner_user_id uuid not null references auth.users(id)`;
- `title text not null`;
- `description text not null default ''`;
- `category text`;
- `image_url text`;
- `target_amount numeric(18,2)`;
- `target_currency text not null default 'USD'`;
- `difficulty_level integer not null default 1`;
- `status text not null default 'active'`;
- `visibility text not null default 'private'`;
- `source_recommended_wish_id uuid references recommended_wishes(id)`;
- `cloned_from_wish_id uuid references wishes(id)`;
- `original_wish_id uuid references wishes(id)`;
- `copied_count integer not null default 0`;
- `completed_at timestamptz`;
- `deleted_at timestamptz`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Ограничения:

- `status in ('active', 'completed', 'archived')`;
- `visibility in ('private', 'public', 'team', 'contacts')`;
- `target_amount >= 0`, если задан;
- `difficulty_level >= 1`.

Индексы:

- `(owner_user_id, status, deleted_at)`;
- `(visibility, status, deleted_at)`;
- `source_recommended_wish_id`;
- `cloned_from_wish_id`;
- `original_wish_id`.

### `feed_post_entities`

Универсальная связка поста с сущностью. Лучше не добавлять отдельный `wish_id` в `feed_posts`, потому что позже тем же механизмом понадобятся челленджи, достижения, задачи и события.

Поля:

- `id uuid primary key`;
- `post_id uuid not null references feed_posts(id)`;
- `entity_type text not null`;
- `entity_id uuid not null`;
- `relation text not null default 'primary'`;
- `created_at timestamptz not null default now()`.

Для желания:

- `entity_type = 'wish'`;
- `entity_id = wishes.id`;
- `relation = 'primary'`.

## RLS

Для `wishes`:

- владелец может читать, создавать, редактировать, архивировать и soft-delete свои желания;
- любой authenticated viewer может читать `public` желания со статусом `active` или `completed`, если `deleted_at is null`;
- `team` и `contacts` visibility добавить после готовых стабильных связей команд и контактов;
- прямые финансовые данные владельца не раскрываются через желание;
- `copied_count` можно обновлять только серверным API или RPC, а не прямым клиентским update.

Для `feed_post_entities`:

- читать можно только вместе с доступным post;
- писать можно только владельцу post или server-side API;
- удалять можно только владельцу post через soft-delete самого post или server-side API.

## API MVP

Все user-specific GET route handlers должны использовать `NO_STORE_HEADERS`, `dynamic = "force-dynamic"`, `revalidate = 0`, `fetchCache = "force-no-store"`.

### `GET /api/wishes`

Возвращает:

- мои активные желания;
- мои выполненные желания;
- мои архивные желания, если запрошено;
- рекомендованные желания, которые еще не добавлены пользователем.

Параметры:

- `status=active|completed|archived|all`;
- `includeRecommended=true|false`.

### `POST /api/wishes`

Создает личное желание.

Источники:

- ручной ввод;
- recommended wish;
- копия публичного wish другого пользователя.

Если создается из recommended wish, API заполняет `source_recommended_wish_id`.

Если создается копия чужого wish, API заполняет:

- `cloned_from_wish_id`;
- `original_wish_id`;
- увеличивает `copied_count` источника.

### `PATCH /api/wishes/[wishId]`

Обновляет только желание владельца:

- title;
- description;
- category;
- image_url;
- target_amount;
- target_currency;
- difficulty_level;
- visibility;
- status.

При `status = completed` выставляет `completed_at`, если его еще нет.

### `DELETE /api/wishes/[wishId]`

Soft-delete желания владельца через `deleted_at`.

### `POST /api/wishes/[wishId]/copy`

Копирует доступное публичное желание другого пользователя себе.

Правила:

- нельзя копировать свое желание через этот endpoint;
- нельзя копировать private/team/contacts желание без соответствующего доступа;
- пользователь получает форму с предзаполненными данными или сразу created copy, если UX выбран быстрым;
- в MVP лучше открывать форму, чтобы пользователь осознанно адаптировал желание.

## UI MVP

Заменить текущий `RecommendedWishes` на полноценный `WishesApp`.

Экран Goals -> Desires:

- плитка "Добавить желание";
- секция "Мои желания";
- секция "Рекомендации";
- секция "Выполненные";
- modal detail;
- modal create/edit;
- action menu для личного желания: edit, complete, archive, delete, visibility;
- кнопка "Добавить себе" у рекомендованного желания.

Для MVP можно оставить grid-плитки как сейчас. Это уже подходит визуально и не требует тяжелой новой структуры.

## Copy Flow

### Рекомендованное желание

1. Пользователь открывает recommended wish.
2. Нажимает "Добавить себе".
3. Открывается create form с предзаполненными полями.
4. Пользователь меняет название, сумму, картинку, описание.
5. Создается row в `wishes` с `source_recommended_wish_id`.
6. Рекомендованное желание исчезает из recommendations или помечается как already added.

### Публичное желание другого пользователя

1. Viewer видит wish post или публичное желание в профиле.
2. Нажимает "Добавить себе".
3. Открывается create form с копией данных.
4. После сохранения создается личное желание viewer.
5. Источник получает `copied_count + 1`.
6. Новый wish может быть private по умолчанию, даже если источник был public.

## Feed Integration

Добавлять в feed вторым этапом, после стабильного CRUD желаний.

Нужно:

- расширить `feed_posts.post_type` значением `wish`, если его еще нет в актуальной check constraint;
- добавить `feed_post_entities`;
- сделать действие "Поделиться желанием" из wish detail;
- post body может быть коротким, например "Мое новое желание";
- карточка поста показывает wish preview: image, title, target amount, author, status;
- CTA для viewer: "Добавить себе";
- если wish уже copied этим viewer, CTA меняется на "Уже в моих желаниях" или "Открыть мое".

Важно: один и тот же wish может иметь несколько постов только если пользователь явно делает новые публикации о прогрессе. Автопубликация нового публичного желания должна быть idempotent.

## Daily Autopost Integration

После появления личных желаний daily autopost может включать:

- новые публичные желания за завершенный день;
- выполненные публичные желания за завершенный день;
- прогресс по публичным желаниям, если владелец включил показ;
- расходы внутри системы только через explicit opt-in.

В daily post попадают только агрегированные snapshot-блоки. Сырые wish records не должны раскрываться в feed API без проверки visibility.

## Challenge Integration

Challenge condition `has_wish` должен проверять:

- есть хотя бы одно личное желание пользователя в `wishes`;
- `deleted_at is null`;
- `status in ('active', 'completed')`.

Если в MVP остается локальный guest-mode, локальные желания можно учитывать отдельно, но серверный check должен опираться на `wishes`.

## Storage And 2 GB Limit

Для MVP не загружать фото/видео желаний в Supabase Storage по умолчанию.

Первый вариант:

- использовать `image_url`;
- рекомендованные изображения остаются внешними URL;
- пользователь может вставить URL картинки;
- локальный upload/компрессию из старого проекта не переносить сразу.

Второй этап:

- добавить Supabase Storage bucket только для сжатых изображений;
- лимитировать размер файла;
- чистить orphan media;
- не хранить видео внутри Supabase до явной необходимости.

## Этапы Реализации

### Этап 1. Personal Wishes CRUD

- создать миграцию `wishes`;
- добавить RLS;
- сгенерировать `lib/database.types.ts`;
- добавить API `/api/wishes`;
- заменить `RecommendedWishes` на `WishesApp`;
- добавить создание, редактирование, выполнение, архивирование, удаление;
- recommended wishes показывать как шаблоны.

Результат: пользователь может создать первое желание и управлять им.

Статус 2026-06-07: этап 1 реализован в `supabase/migrations/20260607135458_personal_wishes_crud.sql`, `app/api/wishes`, `components/WishesApp.tsx`, `components/AppNavigation.tsx`, `app/globals.css`, `lib/i18n.ts` и `lib/database.types.ts`. Доступны личные желания с созданием, редактированием, выполнением, архивированием и soft-delete; рекомендации показываются как read-only шаблоны. Flow "Добавить себе" из recommended wish, фильтрация уже добавленных recommendations и `has_wish` через серверную таблицу остаются в этапе 2.

Статус 2026-06-08: по UI убрана верхняя шапка экрана Wishes, у recommendations убран badge `template`. Этап 2 реализован в `components/WishesApp.tsx`, `app/api/wishes/route.ts`, `app/api/challenges/check/route.ts` и `lib/i18n.ts`: recommended wish открывает предзаполненную форму "Добавить себе", сохраняется `source_recommended_wish_id`, уже добавленные recommendations фильтруются из API/UI, а challenge `has_wish` проверяет серверные `wishes` со статусом `active` или `completed` и `deleted_at is null`.

### Этап 2. Recommended -> My Wish

- сделать "Добавить себе" из recommended wish;
- предзаполнять форму;
- сохранять `source_recommended_wish_id`;
- скрывать или помечать уже добавленные recommendations;
- подключить `has_wish` challenge к `wishes`.

Результат: желания становятся быстрым onboarding-действием.

### Этап 3. Public Wishes And Copy

- добавить public read API для доступного wish;
- добавить copy endpoint;
- добавить `cloned_from_wish_id`, `original_wish_id`, `copied_count`;
- сделать CTA "Добавить себе" у публичного желания;
- по умолчанию copied wish создавать private.

Результат: пользователь может брать чужие идеи, но адаптировать их под себя.

Статус 2026-06-08: этап 3 реализован в `app/api/wishes/[wishId]/route.ts`, `app/api/wishes/[wishId]/copy/route.ts`, `app/api/social/profile/[userId]/route.ts`, `components/SocialApp.tsx`, `app/globals.css` и `lib/i18n.ts`. Доступен public read API для owner/public wish, copy endpoint создает private copy с `cloned_from_wish_id` и `original_wish_id`, защищает от повторной копии, увеличивает `copied_count`, а публичный профиль показывает public wishes с CTA "Добавить себе".

### Этап 4. Wish Posts In Feed

- добавить `feed_post_entities`;
- добавить post type `wish`;
- добавить publish action из wish detail;
- показывать wish preview в feed/blog/detail;
- добавить CTA copy wish из post card/detail;
- обеспечить одинаковый вид published wish post в общей ленте и блоге.

Результат: желания становятся социальным контентом, но остаются связанными с личным планом.

Решение 2026-06-08 для этапа 4: по умолчанию wish остается private. Если пользователь выбирает `public`, показывать чекбокс "Опубликовать в ленте"; для нового public wish чекбокс включен по умолчанию, но пользователь может его снять. Copied wish по умолчанию создается `private` и без автопубликации. Лимит MVP: не больше 3 wish-публикаций в ленту в день на пользователя; лимит блокирует только создание feed post, но не создание самого wish.

### Этап 5. Progress And Autoposts

- связать желания с задачами/challenges;
- добавить progress fields или отдельную таблицу progress events;
- включить новые/исполненные публичные желания в daily autopost;
- добавить настройку видимости wish blocks в composer.

Результат: желания начинают показывать реальное движение, а не только картинку будущего.

## Test Plan

- пользователь создает желание и видит его в "Мои желания";
- другой пользователь не видит private желание;
- public желание доступно viewer;
- recommended wish можно добавить себе один раз без дубля;
- copied wish можно редактировать независимо от источника;
- удаление copied wish не влияет на оригинал;
- completed wish попадает в выполненные;
- deleted wish не появляется в API;
- challenge `has_wish` засчитывается после создания личного желания;
- wish post появляется в feed/blog только если желание public и post published;
- CTA "Добавить себе" создает личную копию и не раскрывает приватные поля источника.

## Decisions

- Начинать с личных желаний, не с feed.
- Название основной таблицы: `wishes`.
- Медиа для MVP: внешний `image_url`, без Supabase Storage upload.
- Копирование чужого желания создает отдельную личную запись.
- Публичность желания и публикация в ленту - разные действия.
- Feed-связь делать через универсальную `feed_post_entities`.
- Public wishes показываются в публичном профиле, если блок `wishes` разрешен настройками видимости профиля.
- Wish posts в ленту публикуются отдельным действием с лимитом 3 публикации желаний в день.

## Open Questions

1. Нужно ли хранить `target_amount` в `$` Core-логике или как пользовательскую внешнюю стоимость?
2. Нужна ли отдельная категория "финансовая цель" vs "желание/образ"?
3. Должно ли выполнение желания требовать подтверждения/поста или быть ручной отметкой?
4. Закрыто 2026-06-08: public wishes показываются в public profile, а Goals остаются отдельным будущим представлением.
5. Сколько рекомендованных желаний показывать одновременно, чтобы экран не превращался в витрину?
