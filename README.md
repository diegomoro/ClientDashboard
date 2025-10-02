<<<<<<< HEAD
"# ClientDashboard" 
=======
﻿# KORE SIM Operations Console

Production-ready Next.js console for managing KORE Super SIM fleets, multi-account access, and bulk command execution. The app uses NextAuth credential auth with Prisma, sequential KORE sync workers, and a virtualized SIM table built for 20k+ rows.

## Features
- OAuth-backed KORE integration (accounts, fleets, SIMs, SMS logs, command dispatch)
- Owner bootstrap and scoped agent access across accounts/fleets
- Credentials auth (NextAuth + Prisma), bcrypt hashing, AES encrypted client secrets
- Virtualized table with debounced search, persistent multi-select, SMS log drawer
- Command catalog (read/write/custom), pooled dispatch with per-SIM result tracking
- Invite management with fleet-level scopes, revoke, and acceptance flow
- Strict CSP, rate-limited writes, exhaustive server-side scope validation

## Prerequisites
- Node.js 20+
- npm 10+
- PowerShell (for the documented commands)

## Local Setup
```powershell
cd ui
npm install
copy .env.example .env
# Edit .env values if desired (already pre-populated for testing)
npx prisma db push --skip-generate
npx prisma generate
npm run dev
# visit /login
```
Default owner credentials: `diego@dimo.zone` / `A9f2!7c3Z1q8@5r6`.

## Test & Lint
```powershell
cd ui
npm run lint
npm test
```

## Architecture Notes
- **Next.js App Router** with typed route handlers under `/api`
- **Prisma** ORM targeting SQLite (dev) with Postgres-ready schema
- **NextAuth (JWT strategy)** credential provider, owner bootstrap on first sign-in
- **KORE client** (`lib/kore.ts`) parses `KORE_ACCOUNTS_JSON`, caches OAuth tokens, and wraps fleet/SIM/log endpoints with retries and pagination
- **Scope enforcement** in every handler via `requireAuthContext` + helpers in `lib/auth/scopes`
- **Virtualized SIM list** (`@tanstack/react-virtual`) with O(1) render cost and O(n) filter
- **Command dispatcher** chunks per account, polls KORE SMS logs (10x3s backoff) and stores mirrored `CommandLog` entries
- **Access tab** surfaces accounts/fleets/users/invites with instant scope toggles and invite creation
- **Security**: CSP + legacy headers, AES-256-GCM client secret storage, bcrypt hashes, rate limit on commands, owner-only account sync

## Operational Tips
- Re-sync in order: Accounts -> Fleets -> SIMs (buttons in SIMs panel)
- Add child accounts by extending `KORE_ACCOUNTS_JSON`; no code changes required
- To reset Prisma state: delete `ui/dev.db` and rerun `npx prisma db push`
- Clear Next.js cache if hot reload stalls: `Remove-Item .next -Recurse -Force`

## Minimal Test Coverage
- Environment validation (`tests/env.test.ts`)
- Scope helpers (`tests/scopes.test.ts`)

## Troubleshooting
- **Invalid KORE credentials** -> server returns actionable 422/401; update `ui/.env`
- **SQLite lock (P1008)** -> rerun sync; sequential upserts already retry with backoff
- **Invite already used** -> delete invite and recreate from Access tab

## Deployment Checklist
- Provision Postgres and set `DATABASE_URL`
- Provide a unique 64-char hex `ENCRYPTION_KEY`
- Configure environment secrets via `ui/.env`
- Run `npm run build && npm start`
- Ensure `NEXTAUTH_URL` points to the production domain
>>>>>>> 7ee0fee (feat: production-ready KORE console (auth, scopes, sync, commands, logs, UI polish))
