// Production database migrations.
//   npm run db:prod:status    read-only: compare repo migrations with production
//   npm run db:prod:migrate   apply pending migrations to production, after safety checks
//
// Access comes only from the developer's Supabase account (npm run db:prod:login). The database
// password is never used: remote commands run with stdin closed, so the CLI cannot prompt for it,
// and it authenticates with a temporary login role created through the account's access token.
//
// The repo is linked to the hardcoded production ref only while this script runs (the link sets
// up the IPv4 pooler connection) and is always unlinked on exit, so a raw `npx supabase db push`
// typed later can't reach production by accident. Seeds are never pushed (no --include-seed).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MIGRATIONS_DIR,
  ROOT,
  ask,
  bold,
  capture,
  compareHistories,
  fail,
  green,
  migrationFiles,
  ok,
  parseMigrationList,
  red,
  requireLocalDatabase,
  requireSupabaseCli,
  run,
  step,
  supabase,
  supabaseCapture,
  warn,
  yellow,
} from './lib.mjs';

// The production project ref is the subdomain of the production Supabase URL
// (https://<ref>.supabase.co). It is public, not a secret.
const PROD_PROJECT_REF = 'https://luzsockiocfscsvygdnq.supabase.co';

const ACCESS_HINT =
  'Check that:\n' +
  '  1. You are logged in to the Supabase CLI with the right account:  npm run db:prod:login\n' +
  '  2. That account is a member of the Supabase organization that owns the production project.\n' +
  'You never need the database password for this; access comes from your Supabase account.';

// stdin closed: the CLI can never stop to ask for a password.
const NO_PROMPT = ['ignore', 'inherit', 'inherit'];
const NO_PROMPT_CAPTURE = ['ignore', 'pipe', 'inherit'];

const DESTRUCTIVE_PATTERNS = [
  /\bdrop\s+(table|column|schema|type|view|materialized\s+view)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+column\b.*\btype\b/i,
];

function requireConfigured() {
  if (!/^[a-z]{20}$/.test(PROD_PROJECT_REF)) {
    fail(
      'The production project is not configured in this repo yet.',
      'Ask the project maintainer to set PROD_PROJECT_REF in scripts/db-prod.mjs.',
    );
  }
  requireSupabaseCli();
}

let linked = false;

function unlinkProduction() {
  if (!linked) return;
  linked = false;
  supabaseCapture(['unlink', '--yes'], { stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Links the repo to the production project for the duration of this script. */
function connectToProduction() {
  if (linked) return;
  process.on('exit', unlinkProduction);
  process.on('SIGINT', () => process.exit(130));
  linked = true;
  console.log(`Connecting to production project ${PROD_PROJECT_REF}...`);
  if (
    supabase(['link', '--project-ref', PROD_PROJECT_REF], {
      stdio: NO_PROMPT,
    }) !== 0
  ) {
    fail('Could not connect to the production project with your Supabase account.', ACCESS_HINT);
  }
  let linkedRef = '';
  try {
    linkedRef = readFileSync(path.join(ROOT, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  } catch {
    // handled below
  }
  if (linkedRef !== PROD_PROJECT_REF) {
    fail(
      `Expected to be connected to ${PROD_PROJECT_REF} but the CLI is linked to "${linkedRef || 'nothing'}". Nothing was changed.`,
    );
  }
}

function readProductionHistory() {
  connectToProduction();
  const { status, stdout } = supabaseCapture(
    ['migration', 'list', '--linked', '--output-format', 'json'],
    { stdio: NO_PROMPT_CAPTURE },
  );
  if (status !== 0) fail('Could not read the migration history from production.', ACCESS_HINT);
  try {
    return parseMigrationList(stdout).remote;
  } catch {
    fail('Could not understand the migration history returned by the Supabase CLI.');
  }
}

function report(history) {
  const total = migrationFiles().length;
  console.log(`  Applied in production: ${history.appliedCount} of ${total} repo migrations`);
  if (history.pending.length) {
    console.log(`  ${yellow('Pending')} (in the repo, not yet in production):`);
    for (const version of history.pending) console.log(`    - ${fileFor(version)}`);
  }
  if (history.unknown.length) {
    console.log(`  ${red('Unknown')} (in production, missing from the repo):`);
    for (const version of history.unknown) console.log(`    - ${version}`);
  }
}

function fileFor(version) {
  return migrationFiles().find((migration) => migration.version === version)?.file ?? version;
}

/** Stops on anything that means production and the repo disagree. Shared by status and migrate. */
function requireConsistentHistory(history) {
  const first = migrationFiles()[0]?.version;
  if (history.unknown.length) {
    fail(
      'Production has migrations that are not in this repo.',
      'Someone applied a change to production outside this workflow, or your branch is missing commits.\n' +
        'Nothing was changed. Run git pull, and if this persists talk to the project maintainer.',
    );
  }
  if (first && history.pending.includes(first)) {
    fail(
      "Production's migration history is not in sync with this repo (even the first migration shows as pending).",
      'Pushing now would try to re-run every migration on production, so this script refuses to continue.\n' +
        'Nothing was changed. Talk to the project maintainer.',
    );
  }
  if (history.outOfOrder.length) {
    fail(
      `These migrations are older than the newest migration already in production: ${history.outOfOrder.map(fileFor).join(', ')}`,
      'Migrations must always be newer than what is in production. Recreate the file with npm run db:new\n' +
        '(it picks a valid version), move your SQL into it, and delete the old file.',
    );
  }
}

function git(args) {
  const result = capture('git', args, { quiet: true });
  return { ...result, stdout: result.stdout.trim() };
}

function requireMainUpToDate() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  if (branch !== 'main') {
    fail(
      `You are on branch "${branch}". Production migrations can only be applied from main.`,
      'Merge your pull request first, then run:  git checkout main && git pull && npm run db:prod:migrate',
    );
  }
  if (git(['status', '--porcelain']).stdout) {
    fail(
      'You have uncommitted changes.',
      'Production must get exactly what is on main. Commit or stash your changes first.',
    );
  }
  if (git(['fetch', 'origin', 'main', '--quiet']).status !== 0) {
    fail(
      'Could not reach GitHub to check that main is up to date.',
      'Check your internet connection and try again.',
    );
  }
  const [ahead, behind] = git(['rev-list', '--left-right', '--count', 'HEAD...origin/main'])
    .stdout.split(/\s+/)
    .map(Number);
  if (behind)
    fail(`Your main is ${behind} commit(s) behind GitHub.`, 'Run git pull and try again.');
  if (ahead)
    fail(
      `Your main has ${ahead} commit(s) that are not on GitHub.`,
      'Changes must go through a pull request. Push them on a branch and open a PR.',
    );
  ok('On main, clean, and up to date with GitHub');
}

function requireTestedLocally(pending) {
  requireLocalDatabase();
  const { status, stdout } = supabaseCapture(
    ['migration', 'list', '--local', '--output-format', 'json'],
    { quiet: true },
  );
  if (status !== 0)
    fail(
      'Could not read the local migration history.',
      'Make sure the local database is running: npm run db:start',
    );
  const appliedLocally = new Set(parseMigrationList(stdout).remote);
  const untested = pending.filter((version) => !appliedLocally.has(version));
  if (untested.length) {
    fail(
      `These migrations were never applied to your local database: ${untested.map(fileFor).join(', ')}`,
      'Test them locally first: npm run db:migrate, check the app with npm run dev, then try again.',
    );
  }
  ok('Every pending migration has been applied to your local database');
  if (run(process.execPath, [path.join(ROOT, 'scripts', 'db-test.mjs')]) !== 0) {
    fail('Smoke tests failed locally. Fix them before touching production.');
  }
}

function warnAboutDestructiveSql(pending) {
  const findings = [];
  for (const version of pending) {
    const file = fileFor(version);
    readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        const code = line.replace(/--.*$/, '');
        if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(code)))
          findings.push(`${file}:${index + 1}  ${line.trim()}`);
      });
  }
  if (!findings.length) return;
  console.log(
    `\n${red(bold('WARNING: these lines can permanently delete or rewrite production data:'))}`,
  );
  for (const finding of findings) console.log(`  ${red('•')} ${finding}`);
  console.log(red('There is no automatic backup or undo. Make sure this is intended.'));
}

async function status() {
  requireConfigured();
  step(`Production migration status (project ${PROD_PROJECT_REF})`);
  const history = compareHistories(
    migrationFiles().map((migration) => migration.version),
    readProductionHistory(),
  );
  report(history);
  requireConsistentHistory(history);
  if (history.pending.length) {
    console.log(
      `\n${yellow(`${history.pending.length} migration(s) waiting.`)} Apply them with: npm run db:prod:migrate`,
    );
  } else {
    console.log(`\n${green('Production is up to date.')}`);
  }
}

async function migrate() {
  requireConfigured();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail(
      'This command needs an interactive terminal, because it asks you to confirm before changing production.',
    );
  }

  step('1/5  Checking git');
  requireMainUpToDate();

  step('2/5  Reading production migration history');
  const history = compareHistories(
    migrationFiles().map((migration) => migration.version),
    readProductionHistory(),
  );
  report(history);
  requireConsistentHistory(history);
  if (!history.pending.length) {
    console.log(`\n${green('Production is already up to date. Nothing to apply.')}`);
    return;
  }

  step('3/5  Checking the migrations were tested locally');
  requireTestedLocally(history.pending);

  step('4/5  Review');
  console.log(
    `About to apply ${bold(history.pending.length)} migration(s) to ${bold(red('PRODUCTION'))} (project ${PROD_PROJECT_REF}):`,
  );
  for (const version of history.pending) console.log(`  - ${fileFor(version)}`);
  warnAboutDestructiveSql(history.pending);
  const answer = await ask(
    `\nType the project ref ${bold(PROD_PROJECT_REF)} to continue, or anything else to cancel: `,
  );
  if (answer !== PROD_PROJECT_REF) {
    console.log('\nCancelled. Nothing was applied.');
    return;
  }

  step('5/5  Applying to production');
  if (
    supabase(['db', 'push', '--linked', '--skip-vault', '--yes'], {
      stdio: NO_PROMPT,
    }) !== 0
  ) {
    fail(
      'supabase db push failed. Read the error above.',
      `See what was applied with: npm run db:prod:status\n${ACCESS_HINT}`,
    );
  }
  ok('Migrations applied to production');
  await status();
}

const commands = { status, migrate };
const command = commands[process.argv[2]];
if (!command) {
  warn(
    'Usage: node scripts/db-prod.mjs <status|migrate>   (use npm run db:prod:status / db:prod:migrate)',
  );
  process.exit(1);
}
await command();
