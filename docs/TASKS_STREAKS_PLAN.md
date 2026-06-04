# Tasks And Streaks Plan

## Iteration 1 Status

### Done

- [x] Added local IndexedDB stores for `tasks` and `taskCompletions`.
- [x] Added third `checks` tab content with a standalone `TasksApp` component.
- [x] Added task creation without Supabase sync.
- [x] Added schedules: one-time, daily, selected weekdays.
- [x] Added finite target days and `infinite days` checkbox.
- [x] Added image URL and compressed local image upload.
- [x] Added subtasks as a local checklist inside the task.
- [x] Split active tasks into `Today` and collapsible `Other` lists.
- [x] Added row-style task panels with thumbnail, title, progress and quick today completion.
- [x] Added task details modal with image, description, subtasks, progress, 14-day preview and one primary `Done` action.
- [x] Added local-only checkboxes for subtasks inside task details.
- [x] Added soft delete with confirmation.
- [x] Added completed/deleted archive screen.
- [x] Added permanent delete from archive with confirmation.
- [x] Added finite streak completion dialog with `Extend` / `Finish`.
- [x] Added optional hardcore streak failure on missed planned days.
- [x] Added streak lives: missed days can be covered with heart completions, with earned lives after a configured number of done days.
- [x] Added `Repeat` action for active and archived tasks, opening `New Task` prefilled from the selected task with today's start date.

### Left

- [ ] Add task editing.
- [ ] Add uncomplete day / undo completion.
- [ ] Add real streak analytics: current streak, longest streak, and richer missed-day history.
- [ ] Add full calendar view by month.
- [ ] After routing exists, add `Note -> New Task` flow: open the `New Task` screen prefilled from the note instead of directly cloning in place.
- [ ] Move uploaded images into a dedicated IndexedDB image store instead of keeping compressed data in the task row.
- [ ] Add offline action queue and Supabase sync.
- [ ] Add Supabase Storage or external image URL strategy for synced user images.
- [ ] Add reminders and push notifications.
- [ ] Persist subtask completion state if it becomes part of progress/streak logic.

## Цель

Сделать третью верхнюю вкладку `checks` экраном текущих задач, привычек и серий. Экран должен работать local-first: сначала показывать локальный кэш, затем фоном синхронизироваться с Supabase. Пользователь должен иметь возможность создавать разовые задачи, ежедневные задачи, задачи на N дней, бесконечные привычки и задачи по дням недели.

## Что берем из старого проекта

В старом проекте уже были полезные идеи:

- задачи с типами `one_time`, `streak`, `daily`;
- локальный кэш перед загрузкой из БД;
- optimistic update при создании/завершении;
- картинка через URL или загрузку с устройства;
- календарь выполнений в деталях;
- карточка-строка с миниатюрой, названием и прогрессом.

Но новую реализацию лучше сделать иначе:

- не хранить streak как единственный счетчик без истории;
- не смешивать ежедневные задачи, streak и расписание в одно поле;
- сразу заложить offline action queue;
- хранить выполнения отдельными событиями, а агрегаты считать поверх них;
- сделать расписание выразительным: daily, weekdays, finite days, infinite.

## Пользовательский сценарий

1. Пользователь открывает вкладку `checks`.
2. Сразу видит задачи из локального кэша.
3. В фоне приложение проверяет Supabase и обновляет экран.
4. Сверху список `Сегодня`.
5. Ниже список `Остальные`.
6. Нажатие на `+` открывает создание задачи.
7. Нажатие на задачу открывает подробности.
8. В деталях можно отметить выполнение за сегодня, увидеть историю дней и следующую неделю.
9. После появления маршрутизации заметку из `Notes` можно будет отправить в экран `New Task` с предзаполненными title/description/reminders.

## Экран Списка

### Структура

- Верхняя панель остается общей навигацией приложения.
- Внутри вкладки:
  - `Сегодня`
  - список задач, которые надо сделать сегодня;
  - `Остальные`
  - активные задачи, которые не требуют действия сегодня;
  - позже можно добавить `Завершено` свернутым блоком.

### Карточка задачи

Стиль: панель-строка, не карточная сетка.

Слева:

- миниатюра картинки на всю высоту строки;
- если картинки нет, спокойный placeholder с иконкой check.

Справа:

- название;
- короткое описание или подзадачи count, если есть;
- прогресс `3/7`, если задача конечная;
- progress bar, если есть `target_days`;
- статус на сегодня: `Сегодня`, `Готово сегодня`, `Следующий день: ср`.

Минимальный вид:

```text
[image]  Заходить в vscode       3/7
         ████████░░░░░░░░░
```

## Создание Задачи

Модалка/нижний sheet `Новая задача`.

Поля:

- название;
- описание;
- подзадачи;
- картинка:
  - загрузить с устройства;
  - вставить ссылку;
  - удалить картинку;
- тип выполнения:
  - разовая;
  - ежедневная;
  - по дням недели;
- длительность:
  - один раз;
  - N дней;
  - бесконечно;
- дата старта, по умолчанию сегодня;
- опционально: связанная заметка.

### Картинки

Для local-first лучше хранить локально только картинки, которые пользователь загрузил сам.

Подход:

- при выборе файла сжать в браузере;
- максимальная сторона 1200px для детали;
- отдельная миниатюра 240px для списка;
- формат WebP или JPEG;
- хранить локально в IndexedDB, а не в localStorage;
- в Supabase позже отправлять в Storage и заменять локальный `local://...` на публичный/storage URL.

Картинки по ссылке не сохраняем локально. Если offline, показываем placeholder или браузерный HTTP cache, если он уже есть.

## Расписание

Нужна модель, которая не ломается при будущих типах.

Предлагаемый `schedule`:

```ts
type TaskSchedule =
  | { type: "once"; date?: string }
  | { type: "daily"; startDate: string; targetDays?: number; infinite: boolean }
  | { type: "weekdays"; startDate: string; weekdays: number[]; targetDays?: number; infinite: boolean };
```

Где `weekdays`:

- `1` понедельник;
- `2` вторник;
- ...
- `7` воскресенье.

Примеры:

- разовая задача: `{ type: "once", date: "2026-05-24" }`
- 7 дней подряд: `{ type: "daily", startDate: "2026-05-24", targetDays: 7, infinite: false }`
- бесконечная привычка: `{ type: "daily", startDate: "2026-05-24", infinite: true }`
- тренировки пн/ср/пт: `{ type: "weekdays", startDate: "2026-05-24", weekdays: [1,3,5], infinite: true }`

## Выполнения И Серии

Не хранить только `streak_current`. Это удобно для отображения, но плохо для восстановления и синхронизации.

Лучше хранить события выполнения:

```ts
type TaskCompletion = {
  id: string;
  taskId: string;
  localDate: string; // YYYY-MM-DD в локальном календаре пользователя
  completedAt: string;
  syncStatus: "local" | "pending_sync" | "synced" | "failed";
};
```

На основе `completions` считаем:

- выполнено сегодня;
- текущая серия;
- самая длинная серия;
- прогресс `completedRequiredDays / targetDays`;
- какие дни подсветить в календаре.

Для weekly schedule серия должна учитывать только запланированные дни. Например, если тренировка пн/ср/пт, то пропущенный вторник не ломает streak.

## Детали Задачи

По нажатию на задачу открывается подробный экран/modal.

Содержимое:

- большая картинка;
- название;
- описание;
- подзадачи с чекбоксами;
- кнопка `Отметить сегодня`;
- прогресс `3/7` или `5 дней streak`;
- календарный блок:
  - уже выполненные дни;
  - текущая неделя;
  - следующая неделя;
  - запланированные, пропущенные и выполненные дни разными состояниями;
- действия:
  - редактировать;
  - завершить;
  - удалить.

Визуально можно вдохновляться streak-календарем из языковых/фитнес-приложений, но сделать спокойнее: меньше геймификации на первом шаге, больше ясности.

## Local-First Архитектура

### Локальное хранилище

Лучше использовать IndexedDB:

- `tasks`;
- `task_completions`;
- `task_images`;
- `offline_actions`;

`localStorage` подходит только для маленького списка рекомендаций, но задачи, изображения и очередь действий лучше держать в IndexedDB.

### Статусы

У задач:

```ts
syncStatus: "local" | "pending_sync" | "synced" | "failed";
deleted?: boolean;
```

У completion events тоже нужен `syncStatus`, потому что отметка дня может случиться offline.

### Очередь действий

Сохранять действия:

- `create_task`;
- `update_task`;
- `delete_task`;
- `complete_task_day`;
- `uncomplete_task_day`;
- `upload_task_image`.

При восстановлении связи:

1. отправить новые/измененные задачи;
2. загрузить локальные картинки в Supabase Storage;
3. отправить completion events;
4. подтянуть remote snapshot;
5. смержить по `updated_at` и event ids.

## Supabase Схема

Черновик таблиц:

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  thumbnail_url text,
  schedule jsonb not null,
  target_days integer,
  status text not null default 'active',
  source_note_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  completed_at timestamptz not null default now(),
  unique (task_id, local_date)
);
```

RLS:

- пользователь видит только свои задачи;
- пользователь меняет только свои задачи;
- completion event должен принадлежать задаче этого пользователя.

## Интеграция С Notes

В `Notes` добавить действие `Сделать задачей`.

Поведение:

- title заметки -> title задачи;
- body заметки -> description;
- reminders можно предложить как schedule/date;
- source_note_id сохраняется в задаче;
- после создания можно открыть task detail.

Не надо удалять заметку автоматически.

### Routing-first note-to-task flow

Do not add direct in-place cloning from `Notes` yet. After routing exists, the desired flow is:

1. User opens a note.
2. User chooses `Make task`.
3. App navigates to `New Task`.
4. `New Task` is prefilled from the note:
   - note title -> task title;
   - note body -> task description;
   - note reminders -> suggested schedule/date;
   - source note id -> future `source_note_id`.
5. User can adjust schedule, image, weekdays and subtasks before saving.

This keeps task creation explicit and avoids silently creating tasks with the wrong schedule.

## Best Practices

- Хранить факты выполнения как события, а не только счетчики.
- Считать streak на клиенте из completion events, чтобы легко восстановить состояние.
- Для recurring tasks всегда учитывать расписание, а не календарные дни подряд.
- Offline-действия делать идемпотентными: одинаковый `completion id` или unique `(task_id, local_date)`.
- Изображения пользователя хранить отдельно от задач; URL в задаче должен быть ссылкой, а не base64 в таблице.
- UI создания делать пошаговым, но без тяжелого wizard:
  - сначала title/description;
  - затем schedule;
  - затем image/subtasks как раскрываемые блоки.
- Не показывать много аналитики в списке: список должен отвечать на вопрос `что делать сейчас`.

## MVP

Первый рабочий срез:

1. Вкладка `checks`.
2. Local IndexedDB store для задач.
3. Создание задачи:
   - title;
   - description;
   - type: once/daily/weekdays;
   - target days или infinite;
   - image URL;
   - upload image с локальным сжатием.
4. Список:
   - `Сегодня`;
   - `Остальные`;
   - row cards с thumbnail/title/progress.
5. Детали:
   - описание;
   - отметить сегодня;
   - текущая и следующая неделя;
   - история выполнений.
6. Pull-to-refresh обновляет задачи активной вкладки.
7. Базовый Supabase sync после восстановления связи.

## После MVP

- Supabase Storage для картинок;
- server-side merge/conflict handling;
- streak protect / восстановление серии;
- напоминания;
- push notifications;
- шаблоны задач из желания;
- автоматическое создание задач AI;
- связь с наградами, Core/Wallet, onboarding checks.

## Вопросы

1. Нужны ли задачи без пользователя до появления auth, как локальные черновики, или `checks` стартует только после user context? - пока локально как notes, после создания пользователей в supabase будем синхронизировать.
2. Для `targetDays`: это количество выполнений вообще или количество календарных дней подряд? - я думаю это количество сколько раз надо отметить выполнение задачи, например 8 тренировок, при 2х в неделю это 4 недели, стрик будет 8, а в деталях видно 4 недели с отмеченными днями тренировок.
3. Для weekdays-задач streak должен считаться по запланированным дням, верно? - да
4. Подзадачи должны влиять на выполнение задачи или это просто чеклист внутри? - пока чеклист (на будущее можно продумать качество стрика в % или x2-x5, или инферно, супернова, ультракилл, godlike)
5. Нужна ли возможность отметить прошлый день, если пользователь забыл отметить сегодня? - может пользователь выбирает при создании варианты стрик: 1.обнуляется после одного пропуска, 2. пропуск не дает очков, но можно продолжить а обнуление если 2 пропуска подряд. 3. Есть количество жизней со старта. 4. Прибавляется жизнь за каждые N очков?
6. Загруженные картинки на MVP храним только локально, а Supabase Storage подключаем следующим этапом? - да следующим этапом. В Supabase вообще не будем хранить контент, только данные и ссылки (место ограничено)
