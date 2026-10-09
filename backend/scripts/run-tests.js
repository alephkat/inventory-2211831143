#!/usr/bin/env node
/**
 * Cross-platform test entry point.
 *
 * Node's built-in test runner auto-discovers `.js`/`.mjs`/`.cjs` files.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TESTS_DIR = join(ROOT, 'tests');

const collect = (dir) => {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collect(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      found.push(full);
    }
  }
  return found;
};

const files = collect(TESTS_DIR).sort();

if (files.length === 0) {
  console.error(`No test files found under ${relative(ROOT, TESTS_DIR)}`);
  process.exit(1);
}

const extra = process.argv.slice(2);
const selected = extra.length
  ? files.filter((f) => extra.some((pattern) => f.includes(pattern)))
  : files;

if (selected.length === 0) {
  console.error(`No test files matched: ${extra.join(', ')}`);
  process.exit(1);
}

console.log(`Running ${selected.length} test file(s) with Node ${process.version}\n`);

/**
 * `shared/config/env.js` refuses to load without its required variables, and
 * importing anything that reaches the Prisma client pulls it in. Supplying
 * throwaway values here keeps the suite hermetic and keeps the real secrets
 * out of the repository: nothing here connects to a database, and the suite
 * asserts against plain objects and pure functions only.
 */
const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/inventory_test?schema=public',
  JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-for-signing-000',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-for-signing-0',
};

const env = { ...process.env };
for (const [key, value] of Object.entries(TEST_ENV)) {
  if (!env[key]) env[key] = value;
}

const result = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', ...selected.map((f) => f.split(sep).join('/'))],
  { stdio: 'inherit', cwd: ROOT, env },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);