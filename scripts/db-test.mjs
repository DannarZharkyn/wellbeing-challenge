// npm run db:test: runs the SQL smoke tests in supabase/tests against the LOCAL database.
// Each test wraps its work in a transaction and ends with `rollback`, so no data is left behind.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { TESTS_DIR, bold, fail, green, localPsql, red, requireLocalDatabase } from './lib.mjs';

requireLocalDatabase();

const files = readdirSync(TESTS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort();
if (!files.length) {
  console.log('No smoke tests found in supabase/tests.');
  process.exit(0);
}

console.log(bold(`Running ${files.length} database smoke test(s) against the local database\n`));
const failures = [];
for (const file of files) {
  const result = localPsql(['-q'], { input: readFileSync(path.join(TESTS_DIR, file)) });
  if (result.status === 0) {
    console.log(`  ${green('✓')} ${file}`);
  } else {
    console.log(`  ${red('✗')} ${file}`);
    console.log(result.stderr.trim().replace(/^/gm, '      '));
    failures.push(file);
  }
}

if (failures.length) {
  fail(
    `${failures.length} of ${files.length} smoke test(s) failed.`,
    'Some tests need an administrator in the local database. If you have none, run npm run db:reset (local data only).',
  );
}
console.log(`\n${green('All smoke tests passed.')}`);
