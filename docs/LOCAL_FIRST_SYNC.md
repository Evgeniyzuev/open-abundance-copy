# Local-First Storage And Sync

This document describes the default storage and sync policy for personal app data.

## Current Local Storage

On the user's device the app can store data in several browser-managed places:

- IndexedDB: primary local-first storage for user data.
- localStorage: small cached app data only.
- Cache Storage: service worker app shell and static assets.
- Browser HTTP cache: external images and network resources the browser decides to keep.

Current IndexedDB database:

```text
open-abundance-offline
```

Current IndexedDB stores:

- `notes`
- `lists`
- `tasks`
- `taskCompletions`

Current localStorage usage:

- `open-abundance:recommended-wishes:v1` for cached recommended wishes.

Current Cache Storage usage:

- service worker app shell;
- manifest and icons;
- Next static chunks under `/_next/static/`.

## Storage Size Control

The app should expose a future storage/debug screen that uses:

```ts
const estimate = await navigator.storage.estimate();
```

Useful values:

- `estimate.usage`: approximate bytes currently used by the origin.
- `estimate.quota`: approximate maximum bytes allowed for the origin.

The app should track and display:

- total origin storage usage;
- IndexedDB usage if we can estimate it;
- local uploaded image usage;
- number of pending sync actions;
- Cache Storage size;
- localStorage cache keys.

## Images

For MVP, uploaded task images may be compressed and stored locally in IndexedDB. Later, uploaded images should move into a dedicated image store instead of being embedded inside task rows.

Recommended future stores:

- `taskImages`
- `wishImages`
- `profileImages`

Suggested image policy:

- compress images in the browser before storage;
- set a maximum side length;
- set a maximum compressed file size;
- store uploaded user images locally in IndexedDB;
- do not store external URL images as app-owned local data;
- rely on browser HTTP cache for external URL images;
- use placeholders when external images are unavailable offline.

Possible limits:

- 300-800 KB per thumbnail/detail image for MVP;
- 50-200 MB total local user image cache;
- cleanup by least-recently-used if a limit is reached.

## Clearing Data

The app should separate destructive and non-destructive cleanup actions.

Safe cleanup:

- clear app shell/cache storage;
- clear small recommendation caches;
- clear temporary downloaded data;
- keep personal user data.

Image cleanup:

- clear local generated/uploaded image cache;
- keep task/note metadata;
- show placeholders if images are missing.

Dangerous cleanup:

- delete IndexedDB user data;
- clear local action queue;
- require explicit confirmation.

Example technical operations:

```ts
indexedDB.deleteDatabase("open-abundance-offline");

localStorage.removeItem("open-abundance:recommended-wishes:v1");

const keys = await caches.keys();
await Promise.all(keys.map((key) => caches.delete(key)));
```

## Source Of Truth

Different domains have different sources of truth.

### Personal User Data

For personal app data, the client app is local-first and should be treated as the primary working copy.

Examples:

- notes;
- tasks;
- task completions;
- personal wishes;
- local user settings;
- drafts.

The server is a synced backup and multi-device coordination layer. It should not delete server data just because a client sends an empty local snapshot.

### Financial Data

For financial data, the database/server is the source of truth.

The client should not own the true balance or ledger state. It should send explicit requests/commands and receive calculated results from the server.

Examples:

- balances;
- financial transactions;
- wallet/account state;
- computed totals;
- access-controlled financial reports.

## Sync Rule

Synchronization must not compare "the entire client list" against the server and delete anything missing from the client.

Instead, sync explicit changes:

- `create_note`;
- `update_note`;
- `delete_note`;
- `create_task`;
- `update_task`;
- `delete_task`;
- `complete_task_day`;
- `uncomplete_task_day`;
- `upload_image`;
- `delete_image`.

Absence of local data means "this device does not currently have the data", not "delete it from the server".

## Deletion Policy

Use soft deletion by default.

Local records:

```ts
deleted?: boolean;
deletedAt?: string;
syncStatus: "local" | "pending_sync" | "synced" | "failed";
```

Server records:

```sql
deleted_at timestamptz
```

Permanent deletion should be a separate explicit action with confirmation.

## Restore Policy

If local data is missing but server data exists, the app should offer recovery instead of deleting server data.

Possible states:

- new device;
- browser storage cleared;
- app reinstalled;
- local database corrupted;
- user manually reset local data.

Recommended recovery flow:

1. App starts and finds no local personal data.
2. App authenticates or identifies the user.
3. App checks server snapshot metadata.
4. If server data exists, show restore options:
   - `Restore from server`;
   - `Start clean on this device`;
   - later: `Compare and merge`.
5. Only explicit user actions should permanently delete server data.

## Conflict Policy

For early MVP, use `updatedAt` and explicit action ids.

Better long-term sync should include:

- stable client-generated ids;
- idempotent action ids;
- per-record `updatedAt`;
- per-record `deletedAt`;
- server confirmation timestamps;
- conflict state for manual resolution when needed.

Basic conflict behavior:

- create operations are idempotent by id;
- completion events are idempotent by `(taskId, localDate)`;
- explicit deletes become `deletedAt`, not hard deletes;
- server restore should not overwrite newer local changes without warning.

## Practical Principle

Personal data sync is a journal of explicit user actions, not a mirror operation where one empty side wipes the other.

Financial data is command/query based, with the server/database as the authority.

## Server-Backed Refresh Freshness

The local-first scope is limited to personal offline working data such as notes and tasks. Server-backed screens such as challenges, profile, core, teams, and wallet should treat the database/API response as the source of truth.

For these server-backed screens, stale UI can be caused by HTTP/CDN/route caching even when Supabase writes are correct. The expected freshness setup is:

- API responses use `NO_STORE_HEADERS` from `lib/httpCache.ts`, including Vercel/CDN no-store headers.
- Critical GET route handlers use `dynamic = "force-dynamic"`, `revalidate = 0`, and `fetchCache = "force-no-store"`.
- Client refresh calls use `cache: "no-store"` and a timestamp query parameter for repeated manual refreshes.
- Service worker fetch handling must pass `/api/*` requests directly to network with `cache: "no-store"` and must not cache API JSON.
- Navigation/app-shell handling may use a short network-first timeout and then fall back to the cached shell, so offline startup stays instant.

This keeps notes/tasks instant and offline-friendly while preventing server-backed UI from being overwritten by stale server responses.

## Cleanup Notes After Cache Fix

The stale challenge/core/wallet issue was most likely caused by cached server-backed API responses, not by local-first notes/tasks.

Changes from the investigation that are probably temporary and can be removed after production is confirmed stable:

- API response debug blocks with `debug.supabaseProjectRef` and `debug.serverReadAt`.
- Diagnostic response fields used only to prove auth/read context, such as `viewerUserId`, `authenticated`, and `userChallengeCount`, unless the UI still needs them for safety.
- Any one-off `needsClientRefresh` response flag left from the reinvest investigation.
- A very short service worker update check interval, such as 30 seconds, if it was only used to make the fixed deployment arrive faster. Restore a calmer interval after update delivery is confirmed, but keep the short navigation fallback timeout for offline startup.

Changes that are still useful as defensive behavior and should not be removed just because caching was the root cause:

- stale-while-refresh UI behavior;
- not clearing old server data before a refresh succeeds;
- not applying guest or wrong-session challenge payloads to authenticated UI;
- out-of-order request guards around user context and challenge reloads;
- local-first notes/tasks remaining independent from Supabase reads.
