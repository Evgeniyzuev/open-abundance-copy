# Core Reinvest And Growth Calculator Plan

## Цели

- Добавить в Core понятную настройку `reinvest_percent` от `0` до `100%`.
- Дать пользователю явное действие сохранения настройки в БД через галочку/кнопку подтверждения.
- Сделать калькулятор роста Core как компактную разворачиваемую панель: снаружи видны только главные результаты, внутри доступны сценарии и параметры.
- Сохранить механику старого проекта, но улучшить UX, тексты, состояние ошибок и математику.
- Не менять финансовую модель: daily rate остается `0.0633%` в день, то есть `0.0006330000`.

## Текущее состояние

- В `public.core_accounts` уже есть поле `reinvest_percent numeric(5, 2) not null default 0 check (reinvest_percent >= 0 and reinvest_percent <= 100)`.
- Daily accrual job уже использует `reinvest_percent`:
  - `gross_amount = core_balance * 0.0006330000`;
  - `core_amount = gross_amount * reinvest_percent / 100`;
  - `wallet_amount = round(gross_amount - core_amount, 2)`;
  - `core_accounts.balance` растет на `core_amount`;
  - `wallet_accounts.balance` растет на `wallet_amount`.
- В `components/WalletApp.tsx` сейчас Core только показывает `reinvest_percent` в meta-строке, но не дает его настроить.
- История начислений уже показывает `daily_rate`, `reinvest_percent`, `core_amount`, `wallet_amount`.

## Что было в старом проекте

Старый компонент: `F:\git\abundance-effect\components\wallet\CoreTab.tsx`.

Полезное поведение:

- показывал daily income от текущего Core;
- показывал разбиение daily income на Wallet и Core по `reinvestPercentage`;
- позволял ввести `reinvestPercentage` вручную и сохранить его;
- считал future core по начальному Core, ежедневным наградам и сроку в годах;
- считал срок до target core через бинарный поиск до 100 лет;
- отмечал челлендж `calculate_time_to_goal` после расчета срока.

Что нужно улучшить:

- старый UI перегружен: два отдельных блока калькулятора занимают много места;
- нет единого сценарного переключателя "сумма через срок / срок до цели";
- `dailyRewards` не объясняет, что это челленджи/пополнения;
- реинвест в калькуляторе жестко берется из сохраненной настройки, нельзя быстро смоделировать другой процент;
- формула `dailyRewards * ((pow(1 + r, days) - 1) / r)` ломается при `r = 0`;
- результат не показывает достаточно ясно future daily income и связь с целью пользователя.

## Reinvest UI

Разместить настройку сразу под Core balance или внутри верхней части Core-экрана, до истории.

Состав блока:

- заголовок: `Reinvest` / `Реинвест`;
- короткий статус: `40% to Core · 60% to Wallet`;
- numeric input `0-100` с suffix `%`;
- slider `0-100`, шаг `1`, для быстрого изменения;
- быстрые пресеты: `0%`, `25%`, `50%`, `75%`, `100%`;
- кнопка-галочка для сохранения в БД, видна/активна только если значение отличается от сохраненного;
- secondary action сброса к сохраненному значению, если значение изменено.

Поведение:

- локально можно двигать значение без немедленной записи в БД;
- галочка сохраняет `reinvest_percent`;
- после успешного сохранения обновить user context/Core и скрыть dirty state;
- при ошибке оставить введенное значение и показать компактную ошибку;
- input валидировать как число `0 <= value <= 100`;
- пустой input считать временным dirty state, но галочку держать disabled;
- дробные значения разрешить до двух знаков, потому что БД `numeric(5,2)`.

API/данные:

- добавить защищенный endpoint или server action для update текущего пользователя:
  - принимает `reinvest_percent`;
  - берет `user_id` из auth token, а не из клиента;
  - пишет только в `core_accounts` текущего пользователя;
  - возвращает обновленный Core account.
- RLS/права должны не позволять менять чужой Core.

## Calculator UI

Калькулятор сделать одной разворачиваемой панелью на Core tab.

Свернутое состояние:

- строка/панель `Growth calculator`;
- слева главный target/result: `Goal` или `Future Core`;
- справа `Daily income`;
- маленький chevron для раскрытия;
- без длинных объяснений, только цифры и понятные labels.

Пример свернутой панели:

```text
Growth calculator
Future Core      $12,480.50
Daily income     $7.90/day
```

Если пользователь выбрал режим цели:

```text
Growth calculator
Goal             $50,000
Time             2y 4m
```

Раскрытое состояние:

- segmented control с режимами:
  - `Future amount` / `Сумма через срок`;
  - `Time to goal` / `Срок до цели`.
- общие inputs:
  - `Start Core`: по умолчанию текущий Core, но редактируемый;
  - `Daily additions`: ежедневный прирост от челленджей/пополнений;
  - `Reinvest in simulation`: по умолчанию сохраненный `reinvest_percent`, но можно менять для сценария;
  - optional toggle `Use current Core`, который возвращает `Start Core` к текущему значению и обновляет его при refresh.
- режим `Future amount`:
  - input `Term`: days/months/years, лучше единый number + segmented unit;
  - output `Future Core`;
  - output `Future daily income`;
  - output `Total added manually`;
  - output `Growth from reinvest`.
- режим `Time to goal`:
  - target type segmented:
    - `Core amount`;
    - `Daily income`.
  - если target type = `Core amount`, input `Goal Core`;
  - если target type = `Daily income`, input `Goal daily income`, а `Goal Core = goalDailyIncome / DAILY_RATE`;
  - output `Estimated time`;
  - output `Target date`;
  - output `Required Core`;
  - output `Daily additions impact` по сравнению со сценарием без daily additions.

Визуальный тон:

- не делать "финансовую таблицу"; это должен быть аккуратный инструмент принятия решения;
- основная цифра крупнее, вторичные расчеты компактнее;
- использовать иконки из `lucide-react`: `Calculator`, `ChevronDown`, `ChevronUp`, `Check`, `RotateCcw`, `Calendar`, `TrendingUp`;
- избегать карточек внутри карточек: панель одна, внутри разделы через легкие separators/rows;
- на mobile inputs идут одной колонкой, outputs закреплены сверху раскрытой панели или сразу под mode switch;
- на desktop можно сделать две колонки: inputs слева, results справа.

## Calculation Rules

Константы:

```text
DAILY_RATE = 0.0006330000
effectiveReinvestRate = DAILY_RATE * reinvestPercent / 100
```

Future Core:

```text
startCore = editable initial core
dailyAdditions = daily challenges/top-ups that go directly to Core
days = selected term in days
r = effectiveReinvestRate

if r > 0:
  futureCore = startCore * (1 + r)^days + dailyAdditions * (((1 + r)^days - 1) / r)

if r = 0:
  futureCore = startCore + dailyAdditions * days
```

Future daily income:

```text
futureDailyGross = futureCore * DAILY_RATE
futureDailyToCore = futureDailyGross * reinvestPercent / 100
futureDailyToWallet = futureDailyGross - futureDailyToCore
```

Time to target:

- target by Core amount:
  - `targetCore = input`;
- target by daily income:
  - `targetCore = targetDailyIncome / DAILY_RATE`;
- если `targetCore <= startCore`, показывать `Already reached`;
- если `dailyAdditions <= 0` и `r <= 0` и `targetCore > startCore`, показывать `Not reachable with current settings`;
- искать срок бинарным поиском:
  - left = `0`;
  - right = `36525` дней, как в старом проекте, то есть 100 лет;
  - если за 100 лет цель не достигнута, показывать `More than 100 years` и предложить увеличить daily additions/reinvest;
  - точность результата: до 1 дня или до `$0.01`.

Формат срока:

- до 60 дней: `N days`;
- дальше: `Y years M months`;
- target date считать от текущей даты на клиенте, но помечать как estimate.

Округление:

- Core calculations внутри клиента считать с высокой JS-точностью, отображать money до `2` знаков;
- micro daily income можно показывать до `6` знаков, если сумма меньше `$0.01`;
- БД остается источником истины для реального Core, калькулятор не создает финансовых операций.

## Challenge Integration

В старом проекте расчет срока отмечал прогресс `calculate_time_to_goal`.

Для нового проекта:

- после первого успешного расчета в режиме `Time to goal` отправить progress `{ calculated: true }`;
- не привязывать выполнение челленджа к сохранению reinvest;
- если endpoint для challenge progress уже есть, использовать его;
- если нет, добавить отдельным следующим этапом, чтобы калькулятор не зависел от челленджей.

## Implementation Steps

1. Добавить API/server action для сохранения `core_accounts.reinvest_percent`.
2. Расширить `useUserContext`/refresh flow так, чтобы после сохранения Core обновлялся без полной перезагрузки.
3. Добавить Reinvest control в Core tab.
4. Добавить pure helper-функции расчета:
   - `calculateFutureCore`;
   - `calculateFutureDailyIncome`;
   - `findDaysToTarget`;
   - `formatDuration`;
   - `normalizePercent`.
5. Покрыть helper-функции unit tests, особенно:
   - `reinvest = 0`;
   - `dailyAdditions = 0`;
   - target уже достигнут;
   - target недостижим;
   - дробный `reinvest_percent`.
6. Добавить разворачиваемую Calculator panel.
7. Подключить challenge progress для `calculate_time_to_goal`.
8. Прогнать `pnpm lint`, `pnpm exec tsc --noEmit` и e2e smoke.

## Acceptance Criteria

- Пользователь может выставить reinvest от `0` до `100%`.
- До нажатия галочки изменение не пишется в БД.
- После галочки значение сохраняется и видно после refresh.
- При `0%` весь daily income идет в Wallet, Core растет только от daily additions/пополнений.
- При `100%` весь daily income идет в Core, Wallet daily income равен `0`.
- Свернутая панель калькулятора показывает только ключевые цифры.
- Раскрытая панель позволяет:
  - задать начальный Core, отличный от текущего;
  - задать ежедневный прирост;
  - задать срок и увидеть future Core/daily income;
  - задать желаемый Core и рассчитать срок;
  - задать желаемый daily income и рассчитать срок.
- Калькулятор корректно работает при `reinvest = 0`, без `Infinity`/`NaN`.
- Реальные начисления в БД не меняются от использования калькулятора.

## Open Questions

- Нужно ли сохранять параметры калькулятора локально между сессиями или каждый раз стартовать от текущего Core?
- Должен ли simulation reinvest отдельно предлагать кнопку `Use as my reinvest`, чтобы сразу перенести сценарий в реальную настройку?
- Daily additions в калькуляторе всегда считаем как прирост Core или нужен split между Core/Wallet?
- Нужен ли максимум срока больше 100 лет для больших целей, или лучше показывать `More than 100 years`?
