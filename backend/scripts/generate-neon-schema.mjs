/**
 * Regenerates prisma/neon-schema.sql from schema.prisma.
 *
 * `prisma migrate diff` output is a one-shot script: Postgres has no
 * `CREATE TYPE IF NOT EXISTS`, and re-running plain CREATE TABLE/INDEX/
 * CONSTRAINT statements fails the second time. This script post-processes the
 * diff into an idempotent form so the file can be pasted into the Neon SQL
 * editor and run repeatedly (e.g. against a fresh branch or a partially
 * initialised database).
 *
 * Usage: npm run prisma:sql   (from the backend folder)
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const HEADER = `-- Full schema DDL generated from prisma/schema.prisma. Idempotent: safe to
-- run more than once. Regenerate with: npm run prisma:sql

`;

function makeIdempotent(diff) {
    return diff
        // --- enum types: Postgres has no CREATE TYPE IF NOT EXISTS ---
        .replace(
            /^CREATE TYPE "([^"]+)" AS ENUM \(([^;]+)\);$/gm,
            (_m, name, values) =>
                `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${name}' AND n.nspname = 'public') THEN CREATE TYPE "${name}" AS ENUM (${values}); END IF; END $$;`,
        )
        // --- tables, indexes ---
        .replace(/^CREATE TABLE "/gm, 'CREATE TABLE IF NOT EXISTS "')
        .replace(/^CREATE UNIQUE INDEX "/gm, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
        .replace(/^CREATE INDEX "/gm, 'CREATE INDEX IF NOT EXISTS "')
        // --- foreign keys: guard on the constraint name ---
        .replace(
            /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY ([^;]+);$/gm,
            (_m, table, constraint, rest) =>
                `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ${rest}; END IF; END $$;`,
        );
}

const diff = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
});

const sql = makeIdempotent(diff);
writeFileSync('prisma/neon-schema.sql', sql);
console.log(`prisma/neon-schema.sql written (${sql.split('\n').length} lines)`);
