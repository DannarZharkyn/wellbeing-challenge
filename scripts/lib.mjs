// Shared helpers for the project scripts (npm run setup, db:*, db:prod:*).
// Plain Node, no dependencies, works on macOS, Linux and Windows.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
export const TESTS_DIR = path.join(ROOT, 'supabase', 'tests');

// The Supabase CLI is pinned in devDependencies; its npm entry point is a Node shim,
// so running it with the current Node binary avoids any shell or PATH differences.
const SUPABASE_BIN = path.join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const bold = paint('1');
export const dim = paint('2');
export const red = paint('31');
export const green = paint('32');
export const yellow = paint('33');

export const ok = (message) => console.log(`${green('✓')} ${message}`);
export const warn = (message) => console.log(`${yellow('!')} ${message}`);
export const step = (message) => console.log(`\n${bold('→')} ${bold(message)}`);

export function fail(message, hint) {
  console.error(`\n${red('✗')} ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

/** Runs a command with the terminal attached (output streams live). Returns the exit code. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Runs a command and returns its stdout. Prompts (stderr) and input still reach the terminal. */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', options.quiet ? 'pipe' : 'inherit'],
    ...options,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function supabaseArgs(args) {
  // --agent no: always behave as in a human terminal, even when run by an AI coding agent.
  return [SUPABASE_BIN, ...args, '--agent', 'no'];
}

export const supabase = (args, options) => run(process.execPath, supabaseArgs(args), options);
export const supabaseCapture = (args, options) =>
  capture(process.execPath, supabaseArgs(args), options);

export function requireSupabaseCli() {
  try {
    readFileSync(SUPABASE_BIN);
  } catch {
    fail('The Supabase CLI is not installed in this project.', 'Run: npm install');
  }
}

export function requireDocker() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    fail(
      'Docker is not running (or not installed).',
      'Open Docker Desktop and wait until it says "Docker is running", then try again.\n' +
        'Install it from https://www.docker.com/products/docker-desktop/ if you do not have it.',
    );
  }
}

/** Local stack info from `supabase status`, or null when the stack is not running. */
export function localStatus() {
  const { status, stdout } = supabaseCapture(['status', '-o', 'json'], { quiet: true });
  if (status !== 0) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export function requireLocalDatabase() {
  requireSupabaseCli();
  requireDocker();
  const info = localStatus();
  if (!info?.DB_URL) fail('The local database is not running.', 'Start it with: npm run db:start');
  return info;
}

export function projectId() {
  const config = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!match) fail('Could not read project_id from supabase/config.toml.');
  return match[1];
}

/** Runs psql inside the local database container, so developers don't need psql installed. */
export function localPsql(args, options = {}) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${projectId()}`,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options },
  );
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Migration files in the repo, sorted by version. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({ file, version: file.split('_')[0] }));
}

/** Parses `supabase migration list --output-format json` into { local, remote } version lists. */
export function parseMigrationList(stdout) {
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error('No JSON in migration list output');
  const { migrations = [] } = JSON.parse(stdout.slice(start));
  return {
    local: migrations.map((row) => row.local).filter(Boolean),
    remote: migrations.map((row) => row.remote).filter(Boolean),
  };
}

/**
 * Compares the repo's migration versions with the versions recorded in a database.
 * - pending: in the repo, not yet applied
 * - unknown: applied in the database but missing from the repo
 * - outOfOrder: pending versions older than the newest applied one (db push refuses these)
 */
export function compareHistories(repoVersions, appliedVersions) {
  const repo = new Set(repoVersions);
  const applied = new Set(appliedVersions);
  const pending = repoVersions.filter((version) => !applied.has(version));
  const unknown = appliedVersions.filter((version) => !repo.has(version));
  const newestApplied = repoVersions
    .filter((version) => applied.has(version))
    .sort()
    .at(-1);
  const outOfOrder = newestApplied ? pending.filter((version) => version < newestApplied) : [];
  return { pending, unknown, outOfOrder, appliedCount: repoVersions.length - pending.length };
}

export async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } catch (error) {
    // Ctrl+C / Ctrl+D at a prompt means "no".
    if (error?.code === 'ABORT_ERR') {
      console.log();
      return '';
    }
    throw error;
  } finally {
    rl.close();
  }
}

export async function confirm(question) {
  return /^y(es)?$/i.test(await ask(`${question} ${dim('[y/N]')} `));
}
