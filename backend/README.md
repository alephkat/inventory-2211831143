# Inventory Management Backend

Node.js + Express + TypeScript + Prisma + PostgreSQL REST API for the
Mobile Inventory Management System. Authentication uses JWT; authorization
(RBAC) is enforced **on the server** for every route.

## Prerequisites

- Node.js >= 18
- A Neon PostgreSQL database (no local Postgres or Docker required)
- Android Studio / Flutter SDK (for the mobile client)

## Setup

```bash
cd backend
npm install

# database: copy .env.example to .env and paste your Neon connection string
# into DATABASE_URL (Neon console -> Connect -> Connection string).
cp .env.example .env

npx prisma generate             # generate the Prisma client

# create the tables. Either paste prisma/neon-schema.sql into the Neon
# SQL Editor, or let Prisma build them:
npx prisma migrate dev --name init

# seed roles, permissions, a default warehouse and an admin user
npx prisma db seed
# (or) npm run seed
```

### Neon notes

- `prisma/neon-schema.sql` is the full DDL (enums, tables, indexes, foreign
  keys) generated from `prisma/schema.prisma`. Use it to bootstrap a fresh
  Neon database from the Console SQL Editor; it is not idempotent, so run it
  once. Regenerate it with `npx prisma migrate diff --from-empty
  --to-schema-datamodel prisma/schema.prisma --script` after schema changes.
- Use the **direct** host (`ep-xxx.<region>.aws.neon.tech`), not the
  `-pooler` host, unless you add `&pgbouncer=true` to the URL.
- Keep `?sslmode=require`; Neon requires TLS.
- Neon supports shadow databases, so `prisma migrate dev` works normally.
- Neon has a web SQL editor and branch management, so no local client
  tooling is required.

## Run

```bash
npm run dev      # watch mode on http://localhost:4000
npm run build    # tsc -> dist/
npm start        # node dist/index.js
```

## Default credentials

Created by `npm run seed`. There is no hard-coded password: the seed uses
`SEED_ADMIN_PASSWORD` from `.env`, or generates a random one and prints it
once if that variable is unset.

| Username | Password                     | Role        |
|----------|------------------------------|-------------|
| admin    | value of `SEED_ADMIN_PASSWORD` | super_admin |

## API contract

All routes are under `/api/v1`. Auth routes:

| Method | Path            | Public | Description                |
|--------|-----------------|--------|----------------------------|
| POST   | /auth/login     | yes    | username + password -> JWT |
| POST   | /auth/refresh   | yes    | refresh access token       |
| POST   | /auth/logout    | auth   | revoke refresh session     |
| GET    | /auth/me        | auth   | current user + permissions |
| POST   | /auth/change-password | auth | change password        |
| POST   | /auth/register  | admin  | create user (manage_users) |
| GET    | /auth/permissions | auth | list roles & permissions   |

Feature routes are protected by `requireAuth`; each route additionally
enforces the exact permission required via `requirePermission(...)`. The
mobile client's permission flags are **display-only** — the API rejects
unauthorized requests with `403`.

### RBAC summary (mirrored in the mobile app)

| Role              | Key capabilities                                              |
|-------------------|----------------------------------------------------------------|
| super_admin       | everything                                                     |
| admin             | everything                                                     |
| inventory_manager | products, stock movements, transfers, adjustments, orders      |
| storekeeper       | receive/transfer/issue stock, view reports                     |
| procurement_officer | suppliers, purchase orders, view inventory & reports         |
| sales_officer     | customers, sales orders, view inventory & reports              |
| auditor           | view inventory, reports, audit logs                            |
| read_only         | view inventory only                                            |

## Backend responsibility for permissions

Frontend permission checks can be bypassed or spoofed. Therefore the
backend re-derives every user's permissions from the database on **every
request** (`auth.ts`) and gates each route with `requirePermission` /
`requireRole`. There is no client-controlled `permissions` field accepted
by the API — the authoritative set lives in `roles` / `role_permissions`.

## Project structure

```
src/
  app.ts            Express app (middleware, body parsers, route mounting)
  index.ts          Server bootstrap
  shared/           config, errors, middlewares (auth, rbac, validate), utils
  routes/           Central feature router registry
  modules/          One folder per domain feature (controller+service+routes)
prisma/schema.prisma
```
