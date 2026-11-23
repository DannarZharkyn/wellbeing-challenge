// npm run db:new -- <short_name>: creates an empty migration that follows the repo naming
// pattern YYYYMMDDNNNN_short_name.sql and always sorts after the existing migrations.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR, ROOT, bold, fail, migrationFiles, ok } from './lib.mjs';

const name = process.argv
  .slice(2)
  .join(' ')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
if (!name)
  fail(
    'Give the migration a short name that says what it changes.',
    'Example: npm run db:new -- add_team_colors',
  );

const now = new Date();
const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
const versions = migrationFiles().map((migration) => migration.version);
const todaysSequences = versions
  .filter((version) => version.length === 12 && version.startsWith(today))
  .map((version) => Number(version.slice(8)));
let version = `${today}${String(Math.max(0, ...todaysSequences) + 1).padStart(4, '0')}`;

// Never create a version that would sort before an existing migration (e.g. a wrong system clock).
const latest = versions.at(-1);
if (latest && version <= latest) version = String(BigInt(latest) + 1n);

const file = `${version}_${name}.sql`;
writeFileSync(
  path.join(MIGRATIONS_DIR, file),
  `-- ${name.replace(/_/g, ' ')}
--
-- Migrations run once, in filename order, on every database: your local one and production.
-- Checklist:
--   * New table? Enable row level security and add policies for anon / authenticated.
--   * New function the app calls? Grant execute to anon / authenticated as needed.
--   * After this file reaches production, never edit it again. Create a new migration instead.

`,
  { flag: 'wx' },
);

ok(`Created ${bold(path.relative(ROOT, path.join(MIGRATIONS_DIR, file)))}`);
console.log(`
Next steps:
  1. Write your SQL in that file.
  2. npm run db:migrate    apply it to your local database
  3. Test the change in the app (npm run dev) and run npm run db:test
  4. Commit, open a PR, merge to main, then: npm run db:prod:migrate
`);
