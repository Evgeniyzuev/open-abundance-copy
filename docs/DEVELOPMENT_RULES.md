# Development Rules

## Always Read These Rules

At the start of any coding task in this repository, read this file unless it is already visible in the current context. Treat it as the project-specific operating checklist.

Do this even if the user does not mention the file in the request.

## UTF-8 And PowerShell

Most source files in this project are UTF-8 and contain Russian UI text.

Avoid rewriting source files with broad PowerShell commands such as:

```powershell
Set-Content path -Value $text
```

This can accidentally introduce a BOM or corrupt non-ASCII text into mojibake.

Preferred editing options:

- use `apply_patch` for manual edits;
- use the app/editor for text edits;
- if a mechanical rewrite is unavoidable, explicitly preserve UTF-8 without BOM and verify the diff immediately;
- after any bulk text rewrite, check that Russian strings are readable in `git diff`.

If mojibake appears in a diff, stop and fix it before continuing.

## Local-First IndexedDB

Personal local data for notes, tasks, streaks, and guest identity shares one IndexedDB database:

```text
open-abundance-offline
```

When adding a store or changing the local schema:

- update `DB_VERSION` in every module that opens this database;
- keep `onupgradeneeded` able to create all known stores, not only the store owned by that module;
- current known stores are `notes`, `lists`, `tasks`, `taskCompletions`, and `guestIdentity`;
- never open the same IndexedDB database with an older version from another store module.

Why this matters: after `guestIdentity` moved the shared DB to version 4, `notesStore` and `tasksStore` still opened version 3. Browsers reject that with `VersionError`, so form submit looked like the "Done" button did nothing and local-first notes/tasks/streaks stopped saving.

For MVP, notes and tasks/streaks are local-only. Do not make their create/update/delete flows wait for Supabase sync unless a dedicated sync plan is being implemented and tested offline.

## Frontend Verification

After frontend UI changes, try to verify the result visually in the in-app browser.

If the browser tool is unavailable, for example `Browser is not available: iab`:

- state this clearly in the final result;
- run the available technical checks instead, such as `tsc --noEmit`, `next build`, and an HTTP 200 check against the local dev server when relevant;
- stop the dev server after the fallback check;
- do not present the change as visually verified.

```text
f:\git\
  abundance-effect\          old app, reference only
  abundance-effect-pwa\      new app, main repo
```

## Verification Command Habits

In this Windows workspace, `pnpm test:e2e` may fail inside the sandbox with `Access denied` before Playwright starts. When running the e2e smoke test for this repo, request escalation for `pnpm test:e2e` immediately instead of first spending a failed sandbox attempt.

`pnpm exec tsc --noEmit` updates the tracked `tsconfig.tsbuildinfo` file as a side effect. Do not commit that file when it changed only because of verification. Restore only that file after typecheck:

```powershell
git restore tsconfig.tsbuildinfo
```

Do not delete `tsconfig.tsbuildinfo`; it is a tracked TypeScript build-info file in this repo. Only revert incidental verification changes to it.

## Docs Status Updates

When implementing work that already has a matching plan or design document in `docs`, update that document with what was actually completed.

- mark completed stages, assumptions, or decisions where the document has a status/checklist section;
- if there is no checklist, add a short "Implemented" or "Current Status" note near the relevant section;
- keep the note factual: what changed, where it lives, and what remains pending;
- do not rewrite the whole plan just because one implementation detail changed;
- if no corresponding document exists, do not create one unless the task needs durable product or technical context.

## UI Text And Translations

Keep the interface quiet and purposeful. Do not add visible explanatory labels, helper text, or repeated captions unless they directly help the current user action.

When adding or changing UI text:

- reuse existing translated components, buttons, labels, and message keys where the meaning matches;
- add new text through the shared language dictionary instead of hardcoding Russian or English in TSX;
- avoid duplicating near-identical button text such as close, cancel, done, refresh, delete, and loading states;
- prefer icon buttons with accessible labels for familiar actions when the screen already makes the action clear;
- keep new message keys stable and ASCII-only.

If a reusable translated element would become awkward or misleading, create a small shared variant instead of copy-pasting text across screens.
