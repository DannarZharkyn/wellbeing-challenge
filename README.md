# Wellbeing Challenge

A Boston University Student Wellbeing challenge platform with student and administrator interfaces.

- **Live app:** [wellbeing-challenge-three.vercel.app](https://wellbeing-challenge-three.vercel.app/)
- **Admin dashboard:** [wellbeing-challenge-three.vercel.app/admin](https://wellbeing-challenge-three.vercel.app/admin)

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Postgres + Auth)

---

## Quick start

You need two things installed:

| Tool                                                              | Version        | Notes                                                               |
| ----------------------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/)                                    | 22.13 or newer | Check with `node --version`.                                        |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | any recent     | Must be **open and running**. OrbStack, Colima or Podman also work. |

You don't need to install the Supabase CLI. It's a project dependency, pinned to a tested version.

Then, from the project folder:

```bash
npm install      # installs the app and the Supabase CLI
npm run setup    # starts the local database and writes .env.local
npm run dev      # starts the app
```

The first `npm run setup` downloads the Supabase Docker images and takes a few minutes. Later runs take seconds.

Open:

- **Student app:** http://localhost:3000
- **Admin dashboard:** http://localhost:3000/admin, login `admin@local.test` / `admin123`

That's it. Everything runs on your machine and **never touches the production database**, so you can create, break and reset data freely.

### What you get

`npm run setup` starts a full Supabase stack (Postgres, Auth, REST API and Studio) in Docker. On a new database it:

1. applies every migration in [supabase/migrations/](supabase/migrations/): tables, security policies, functions, the default activity library and templates;
2. loads demo data from [supabase/seed.sql](supabase/seed.sql), which is **local only** and never runs in production:

| Demo data                 | Details                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Admin user                | `admin@local.test` / `admin123`                                                                   |
| Demo Individual Challenge | Active. Join code `DEMOIN`.                                                                       |
| Demo Team Challenge       | Active. Join code `DEMOGR`. Team codes `CRCREW` (Charles River Crew) and `TPACK1` (Terrier Pack). |

To try the student side, open http://localhost:3000, register a student and join with one of the codes above.

Local services:

| Service                               | URL                                                       |
| ------------------------------------- | --------------------------------------------------------- |
| API (what the app connects to)        | http://127.0.0.1:54321                                    |
| Studio (browse and edit the database) | http://127.0.0.1:54323                                    |
| Postgres                              | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (catches outgoing emails)     | http://127.0.0.1:54324                                    |

The local keys written to `.env.local` are fixed development defaults that only work on your machine, so they're not secret. Production keys live in the Vercel project settings, never in `.env.local`.

---

## Everyday commands

```bash
npm run db:start   # start the local database (if it isn't running)
npm run dev        # start the app
npm run db:stop    # done for the day; your local data is kept
```

| Command                          | What it does                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run setup`                  | Start everything and check `.env.local`. Safe to run any time.                                                |
| `npm run dev`                    | Run the app at http://localhost:3000.                                                                         |
| `npm run db:start` / `db:stop`   | Start or stop the local database. Stopping keeps your data.                                                   |
| `npm run db:status`              | Show whether the local database is running, plus its URLs and keys.                                           |
| `npm run db:reset`               | Rebuild the **local** database from scratch: all migrations plus the demo data. Deletes your local data only. |
| `npm run db:migrate`             | Apply new migrations to the local database, keeping your data.                                                |
| `npm run db:new -- <name>`       | Create a new, empty migration file.                                                                           |
| `npm run db:test`                | Run the database smoke tests on the local database.                                                           |
| `npm run db:prod:status`         | **Read-only.** Show which migrations production has and which are waiting.                                    |
| `npm run db:prod:migrate`        | Apply waiting migrations to **production**, after safety checks.                                              |
| `npm test`                       | Run the fast unit and component tests (Jest).                                                                 |
| `npm run test:e2e`               | Run the student journey in a real browser (Playwright). See [Tests](#tests).                                  |
| `npm run format`                 | Format the code with Prettier. CI fails on unformatted files, so run it before committing.                    |
| `npm run lint` / `npm run build` | Lint the code, or make sure the production build compiles.                                                    |

To run any other Supabase CLI command, use `npx supabase <command>`, which uses the project's pinned CLI version.

---

## Changing the database

The files in [supabase/migrations/](supabase/migrations/) are the **single source of truth** for the database: schema, security policies (RLS) and functions. Every database, local and production, is built by running these files in filename order.

**Golden rules**

- Change the database only through a new migration file. Never edit the schema by hand in Studio or the production dashboard.
- Never edit a migration that is already in production. Create a new one instead.
- Never point `.env.local` at production.

**Step by step**

1. Create a migration:

   ```bash
   npm run db:new -- add_team_colors
   ```

   This creates `supabase/migrations/YYYYMMDDNNNN_add_team_colors.sql` with a short checklist inside.

2. Write your SQL. For a new table, enable row level security and add policies. For a function the app calls, `grant execute` to `anon` and/or `authenticated`.
3. Apply it to your local database:

   ```bash
   npm run db:migrate
   ```

   If the migration fails, fix the SQL and run it again. If you get stuck, `npm run db:reset` rebuilds the local database from zero.

4. Test the change in the app (`npm run dev`) and run `npm run db:test`.
5. Run `npm run format`, commit, open a pull request and merge it into `main` once CI passes.
6. Apply it to production (next section).

---

## Deploying migrations to production

The app itself deploys to Vercel. Database migrations are applied separately with `npm run db:prod:migrate`.

### One-time setup

1. Ask the project maintainer to add your Supabase account to the organization that owns the production project.
2. Log in the CLI with that account (it opens your browser):

   ```bash
   npm run db:prod:login
   ```

   You never need the database password. Access comes only from your Supabase account, and the scripts never ask for the password.

3. Check that you can read production. This command only reads:

   ```bash
   npm run db:prod:status
   ```

### Applying migrations

```bash
git checkout main
git pull
npm run db:start        # the checks below use your local database
npm run db:migrate      # make sure your local database has the same migrations
npm run db:prod:migrate
```

The script walks you through 5 steps and **stops without changing anything** if a check fails:

1. **Git:** you must be on `main`, with no uncommitted changes, and in sync with GitHub. Production only gets what has been merged.
2. **Production history:** reads which migrations production already has. It refuses to continue if production has migrations that aren't in the repo, or if the history doesn't match the repo. There's nothing to do when production is already up to date.
3. **Tested locally:** every waiting migration must already be applied to your local database, and the smoke tests must pass.
4. **Review:** lists the migrations it will apply and highlights any line that can delete data (`drop table`, `drop column`, `truncate`, `delete from`, column type changes). **There is no automatic backup or undo**, so read this carefully. To continue, you must type the production project ref.
5. **Apply:** runs `supabase db push` against the production project, then shows the final status.

While it runs, the script temporarily links the repo to production and always unlinks it at the end, even if something fails. That way, a Supabase command typed by hand later can't reach production by accident.

The demo data in `supabase/seed.sql` is never sent to production.

---

## Tests

### Unit and component tests

Fast calculation and component tests, run with Jest:

```bash
npm test
```

### Browser journey

The first time you run the full browser journey, install its local Chromium browser:

```bash
npx playwright install chromium
```

Then run the student journey in a real browser:

```bash
npm run test:e2e
```

For an interactive Playwright window that lets you watch and inspect each step:

```bash
npm run test:e2e:ui
```

The browser test answers every Supabase request with its own isolated responses, so it doesn't need the local database and never touches production data.

### Database smoke tests

[supabase/tests/](supabase/tests/) contains SQL smoke tests for the most important database flows (final results, team management, participant imports). Each test runs inside a transaction and ends with `rollback`, so it leaves no data behind.

```bash
npm run db:test
```

Some tests need an administrator in the local database. The demo admin from the seed covers this.

### What CI checks on every pull request

GitHub Actions ([.github/workflows/](.github/workflows/)) runs `npm run format:check`, `npm run lint`, the Jest tests and the browser journey. Run `npm run format` before committing so the formatting check passes.

---

## Project structure

```text
app/
  page.tsx                 Student experience (home, challenges, ranking, profile)
  admin/page.tsx           Administrator dashboard (/admin)
  challenges/, ranking/,   Student routes
  profile/
  ui.tsx                   Shared UI components
  components/              Components with their Jest tests (*.test.tsx)
lib/
  supabase/client.ts       Browser Supabase client (reads the NEXT_PUBLIC_* variables)
  student-progress.ts      Progress calculations, tested in student-progress.test.ts
e2e/                       Playwright browser journey (npm run test:e2e)
scripts/                   The npm run setup / db:* / db:prod:* scripts
supabase/
  config.toml              Local Supabase stack configuration (ports, auth settings)
  migrations/              Schema, security policies and functions, applied in order
  seed.sql                 Local-only demo data (admin user and demo challenges)
  tests/                   Rollback-only SQL smoke tests
.env.example               Template for .env.local (npm run setup writes the real one)
.github/workflows/         CI: formatting, lint, Jest and browser tests on pull requests
```

Admin permissions are enforced in the database, not the frontend. A user is an administrator only if they have a row in `public.admin_users`, which `public.is_admin()` checks.

---

## Troubleshooting

| Problem                                                                                                                            | Fix                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is not running`                                                                                                            | Open Docker Desktop, wait until it says it's running, then run `npm run setup` again.                                                                                                                                                                                                         |
| `port is already allocated` / `address already in use`                                                                             | Another Supabase project is running on the same ports. Run `npx supabase stop --all`, then `npm run setup`.                                                                                                                                                                                   |
| `npm run setup` warns that `.env.local` points somewhere else                                                                      | Your `.env.local` points at another database, maybe production. Answer `y` to switch it to the local database. The old file is saved as `.env.local.bak`.                                                                                                                                     |
| App shows no data, or admin says "Supabase is not configured"                                                                      | Run `npm run setup`, then **restart** `npm run dev`. Next.js only reads `.env.local` at startup.                                                                                                                                                                                              |
| Admin login says "Email or password is incorrect."                                                                                 | Use `admin@local.test` / `admin123`. If it still fails, your local database was created before the demo data existed. Run `npm run db:reset` (local data only).                                                                                                                               |
| `npm run setup` says there is no administrator                                                                                     | Same cause as above. Run `npm run db:reset`.                                                                                                                                                                                                                                                  |
| A migration fails on `db:migrate` or `db:reset`                                                                                    | The error names the file. It's usually your newest migration. Fix it and run the command again.                                                                                                                                                                                               |
| `db:prod:*` says it could not connect to the production project (`Authorization failed for the access token and project ref pair`) | You're logged in with an account that can't see production. Nothing was changed. Run `npm run db:prod:login` with the right account, or ask the maintainer to add your account to the Supabase organization.                                                                                  |
| `db:prod:migrate` says production's history doesn't match the repo                                                                 | Nothing was changed. Don't try to fix this yourself. Talk to the project maintainer.                                                                                                                                                                                                          |
| `db:prod:migrate` says a migration is older than production's newest                                                               | Create a new file with `npm run db:new`, move your SQL into it and delete the old file.                                                                                                                                                                                                       |
| `db:prod:*` says the production project is not configured                                                                          | The maintainer still has to set `PROD_PROJECT_REF` in [scripts/db-prod.mjs](scripts/db-prod.mjs).                                                                                                                                                                                             |
| Vercel or CI fails with `Cannot find module '../lightningcss.linux-x64-gnu.node'` (or a similar `.node` file)                      | `package-lock.json` lost the native binaries for other platforms. This happens when it's regenerated on a Mac while `node_modules` exists. Don't hand-edit it; ask the maintainer. To avoid it, never delete `package-lock.json` alone: if you must regenerate it, delete `node_modules` too. |
