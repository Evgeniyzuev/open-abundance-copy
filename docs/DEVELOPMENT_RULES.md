# Development Rules

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

```text
f:\git\
  abundance-effect\          old app, reference only
  abundance-effect-pwa\      new app, main repo
```
