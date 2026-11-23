// npm run setup: one command to get a working local environment.
// Safe to run as often as you like; it only (re)starts the local stack and checks .env.local.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  bold,
  confirm,
  dim,
  fail,
  localPsql,
  localStatus,
  ok,
  requireDocker,
  requireSupabaseCli,
  step,
  supabase,
  warn,
  yellow,
} from './lib.mjs';

const ENV_FILE = path.join(ROOT, '.env.local');
const MIN_NODE = [22, 13];

step('Checking prerequisites');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  fail(
    `Node.js ${MIN_NODE.join('.')} or newer is required (you have ${process.versions.node}).`,
    'Install it from https://nodejs.org/',
  );
}
ok(`Node.js ${process.versions.node}`);
requireSupabaseCli();
requireDocker();
ok('Docker is running');

step('Starting the local database (the first run downloads Docker images and takes a few minutes)');
let info = localStatus();
if (info?.API_URL) {
  ok('Local Supabase is already running');
} else if (supabase(['start']) !== 0) {
  fail(
    'Could not start local Supabase.',
    'If the error mentions a port that is already in use, another Supabase project is running.\n' +
      'Stop it with: npx supabase stop --all   and then run npm run setup again.',
  );
}
info = localStatus();
if (!info?.API_URL || !info?.PUBLISHABLE_KEY)
  fail('Local Supabase started, but its URL and key could not be read.');

step('Configuring .env.local');
const wanted = {
  NEXT_PUBLIC_SUPABASE_URL: info.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: info.PUBLISHABLE_KEY,
};
const envContent =
  '# Local development: points at the Supabase stack running in Docker on this machine.\n' +
  '# Written by `npm run setup`. Never put production values here.\n' +
  Object.entries(wanted)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') +
  '\n';

function readEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, '')]),
  );
}

if (!existsSync(ENV_FILE)) {
  writeFileSync(ENV_FILE, envContent);
  ok('Created .env.local pointing at the local database');
} else {
  const current = readEnv(ENV_FILE);
  const matches = Object.entries(wanted).every(([key, value]) => current[key] === value);
  if (matches) {
    ok('.env.local already points at the local database');
  } else {
    const currentUrl = current.NEXT_PUBLIC_SUPABASE_URL || '(not set)';
    warn(`.env.local currently points at: ${bold(currentUrl)}`);
    if (/supabase\.co/i.test(currentUrl)) {
      console.log(
        yellow(
          '  That is a remote Supabase project, probably production. Running the app locally against it\n' +
            '  would read and change real data. Local development should use the local database.',
        ),
      );
    }
    const overwrite =
      process.stdin.isTTY &&
      (await confirm('Replace it with the local values? A backup is saved to .env.local.bak.'));
    if (overwrite) {
      copyFileSync(ENV_FILE, `${ENV_FILE}.bak`);
      writeFileSync(ENV_FILE, envContent);
      ok('Updated .env.local (previous version saved to .env.local.bak)');
    } else {
      warn(
        'Kept your .env.local unchanged. The app will NOT use the local database until it points at ' +
          info.API_URL,
      );
    }
  }
}

step('Checking local demo data');
const admins = localPsql(['-tAc', 'select count(*) from public.admin_users']);
const adminCount = Number(admins.stdout.trim());
if (admins.status === 0 && adminCount > 0) {
  ok(`${adminCount} administrator account(s) in the local database`);
} else {
  warn(
    'The local database has no administrator yet (it was probably created before supabase/seed.sql existed).\n' +
      `  Run ${bold('npm run db:reset')} to rebuild it with the demo data. This deletes your local data only.`,
  );
}

console.log(`
${bold('All set. Start the app with:')}  npm run dev

  Student app      http://localhost:3000
  Admin dashboard  http://localhost:3000/admin   ${dim('login: admin@local.test / admin123')}
  Database UI      ${info.STUDIO_URL ?? 'http://127.0.0.1:54323'}
  Demo codes       DEMOIN (individual) · DEMOGR (team), team codes CRCREW / TPACK1

When you're done for the day: npm run db:stop
`);
