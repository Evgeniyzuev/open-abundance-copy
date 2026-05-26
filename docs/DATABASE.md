# Database

Supabase project ref: `bsikxrsguwketlloflgi`

## Source Of Truth

- `supabase/migrations/` stores schema changes.
- `supabase/schema.sql` can store a generated schema snapshot.
- `supabase/seed.sql` stores optional local seed data.
- `lib/database.types.ts` should be generated from the remote schema when the API surface changes.

## Common Commands

Authenticate the CLI first:

```bash
pnpm dlx supabase login
```

Or set `SUPABASE_ACCESS_TOKEN` in your shell before running CLI commands.

Link this repo to the remote project:

```bash
pnpm db:link
```

Pull the current remote schema into a migration:

```bash
pnpm db:pull
```

Create a new migration:

```bash
pnpm dlx supabase migration new <name>
```

Apply local migrations to the linked remote project:

```bash
pnpm db:push
```

Generate TypeScript database types:

```bash
pnpm db:types
```

Dump the public schema snapshot:

```bash
pnpm db:dump
```

Dump data from another Supabase/Postgres database:

```bash
pnpm dlx supabase db dump --db-url "<OLD_DATABASE_URL>" -f old_data.sql --data-only --use-copy
```

## Notes

CSV import/export is useful for individual tables. SQL dumps are better for moving full schemas, policies, indexes, functions, triggers, and larger data sets.

Local-first storage, client/server source-of-truth rules, restore behavior, and sync policy are documented in [`LOCAL_FIRST_SYNC.md`](./LOCAL_FIRST_SYNC.md).

Guest-first onboarding, user identity states, profile schema, guest claim flow, and rewards planning are documented in [`USERS.md`](./USERS.md).

General development rules, including UTF-8/PowerShell safety, are documented in [`DEVELOPMENT_RULES.md`](./DEVELOPMENT_RULES.md).

Do not commit `.env`, database passwords, service role keys, JWT secrets, or `supabase/.temp`.
