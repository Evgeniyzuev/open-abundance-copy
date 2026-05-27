# Users

This document describes the planned user model, guest-first onboarding, and database direction.

## Product Approach

The app should allow a first session without registration forms.

Goal:

- no barrier on first launch;
- user can create value immediately;
- registration appears later as a useful task, not as a wall.

Recommended first-run flow:

1. User opens the app.
2. App creates a local guest identity.
3. User can create notes, tasks, wishes and progress locally.
4. App stores data local-first in IndexedDB.
5. After the user has a reason to care, app suggests a task like `Save your progress`.
6. User registers with email, Google, Telegram, or another supported provider.
7. Optional phone verification can unlock a bonus.
8. Guest data is attached to the registered account and synced.

## Identity States

### Guest

A guest is a local-only user identity.

Properties:

- generated on first launch;
- stored locally;
- can be reused on the same device;
- can create local-first data;
- does not yet exist as a durable user in Supabase Auth;
- can receive local preview rewards, but not authoritative financial rewards.

Possible local fields:

```ts
type LocalGuestIdentity = {
  guestId: string;
  createdAt: string;
  lastSeenAt: string;
  claimedUserId?: string;
};
```

Storage:

- IndexedDB is preferred.
- localStorage is acceptable only for a small pointer/session hint.

### Registered User

A registered user exists in Supabase Auth and in app profile tables.

Registration options:

- email;
- Google;
- Telegram;
- phone verification as an additional bonus step.

After registration:

- user has `auth.users.id`;
- profile row exists;
- local guest data can be claimed;
- sync to server becomes active;
- rewards/financial accruals can become real server-side records.

## Return Visits

On app start:

1. Check Supabase Auth session.
2. If authenticated, load registered user context.
3. If not authenticated, check local guest identity.
4. If guest exists, continue guest mode.
5. If no guest exists, create guest identity.

Do not ask for login immediately.

## Registration As A Task

Registration should be one of the first tasks after the user has interacted with the app.

Example task copy:

- `Save your progress`
- `Protect your data`
- `Sync between devices`
- `Claim your bonus`

This task can offer:

- email signup;
- Google login;
- Telegram login;
- phone verification bonus.

Phone should be optional unless legally/product-wise required.

## Rewards Policy

Before registration:

- local progress can be shown;
- preview bonuses can be shown;
- local achievements can be unlocked;
- financial/accounting records are not authoritative.

After registration:

- server creates authoritative reward records;
- phone verification can add bonus;
- financial state comes from the database/server.

This matches the source-of-truth policy in [`LOCAL_FIRST_SYNC.md`](./LOCAL_FIRST_SYNC.md):

- personal data is local-first;
- financial data is server/database authoritative.

## Guest Data Claim

When the user registers, the app should claim local guest data.

High-level flow:

1. User completes auth.
2. App gets `userId` from Supabase Auth.
3. App creates/loads user profile.
4. App marks local guest as claimed by `userId`.
5. App uploads local actions/data with stable client-generated ids.
6. Server stores records under `userId`.
7. Local records are marked `synced`.

Important:

- do not delete server data because local data is empty;
- use explicit action sync;
- keep soft deletion;
- make guest claim idempotent.

## Database Draft

Supabase Auth already owns the core auth user:

```sql
auth.users (
  id uuid primary key,
  email text,
  phone text,
  created_at timestamptz
)
```

Application profile table:

```sql
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  default_locale text not null default 'ru',
  timezone text,
  onboarding_state jsonb not null default '{}'::jsonb,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Optional linked identities table:

```sql
create table public.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_subject text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  unique (provider, provider_subject)
);
```

Guest claim table:

```sql
create table public.guest_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null,
  claimed_at timestamptz not null default now(),
  device_label text,
  unique (guest_id)
);
```

## RLS Draft

Profiles:

```sql
alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```



Rewards should generally be written by server-side code or controlled database functions, not directly by the client.

## Development Plan

1. Add local guest identity storage.
   - Generate `guestId` on first launch.

2. Add user context layer.
   - Detect Supabase Auth session.
   - Return either `guest` or `registered` context.
   - Keep app usable in guest mode.

3. Add onboarding task.
   [x] Add a recommended task/card: `Save your progress`.

4. Add Supabase Auth.
   - Email first.
   - Google next.
   - Telegram if product direction still needs it.
   - Phone verification as optional bonus.

5. Add profile table migration.
   - `user_profiles`.
   - RLS policies.
   - trigger/function to create profile after signup if useful.

6. Add guest claim flow.
   - Write `guest_claims`.
   - Mark local guest as claimed.
   - Make the operation idempotent.

7. Add sync ownership.
   - Personal records get `user_id`.
   - Local records keep stable ids.
   - Sync sends explicit actions to server.
   - Empty client does not delete server data.

8. Add restore flow.
   - If authenticated server data exists and local data is missing, offer restore.
   - Do not silently overwrite local data.

9. Add financial ledger.
   - Store every Core and Wallet balance change as a server-authoritative financial operation.
   - Keep challenge progress separate from financial operation history.
   - Use ledger/event rows for reward payouts, transfers, reversals and future audits.

10. Add account/storage settings.
    - show guest/registered state;
    - show storage usage;
    - clear cache;
    - reset local data with warning;
    - restore from server.

## Open Questions

- Which auth providers should launch first: email only, email + Google, or email + Google + Telegram?
- Should phone verification be available immediately or after core sync works?
- What exact bonus does phone verification grant?
- Do guest users need cross-device transfer before registration?
- Should guest data expire locally after long inactivity?
