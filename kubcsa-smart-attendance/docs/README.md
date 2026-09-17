# KUBCSA Attendance System

## Local setup

Requirements: Node.js 20+, npm, and no Docker.

```powershell
cd kubcsa-smart-attendance/backend
npm install
Copy-Item .env.example .env
npx prisma generate --schema=../prisma/schema.prisma
npx prisma migrate dev --schema=../prisma/schema.prisma --name init
npx tsx src/seed.ts
npm run dev
```

In another terminal:

```powershell
cd kubcsa-smart-attendance/frontend
Copy-Item .env.example .env
npm install
npm run dev
```

The dashboard is available at `http://localhost:3000`; the API health check is `http://localhost:4000/health`.

Admin login: `http://localhost:3000/login`

Seed credentials: `admin@kubcsa.org` / `ChangeMe123!`. Change this immediately outside local development. New admin registrations are approval requests only; an existing approved administrator must approve them from the **Admins** dashboard module before they can sign in. Approved administrators can revoke or delete another admin account, but cannot delete themselves or the last approved administrator.

## API surface

- `POST /api/auth/login` and `POST /api/auth/refresh`
- `GET /api/events/active` for the public student check-in page
- `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id/status`
- `POST /api/attendance` validates QR, active time window, GPS radius, and unique registration/phone constraints
- `GET /api/attendance` for authenticated administrators

Open `http://localhost:3000/check-in` for the student attendance form. It requests GPS permission and requires the event QR value before submission.

## Production deployment requirements

Use PostgreSQL as the production database, set all required environment variables, run `npx prisma migrate deploy`, and deploy the frontend to Vercel and the API to Railway, Render, or a Linux VPS. Configure HTTPS, secure refresh tokens, rate limiting, audit logging, and a managed PostgreSQL backup policy before public launch.

## Production hardening added

- Environment validation prevents unsafe default secrets in production
- CORS is restricted to configured frontend origins
- Helmet is enabled to add security headers
- Rate limiting is enabled for authentication and general API requests
- Large JSON payloads are limited to reduce abuse
- The API fails fast if production configuration is incomplete or SQLite is used in a deployed environment

## Recommended deployment stack

- Frontend: Vercel
- Backend: Railway or Render
- Database: PostgreSQL (Neon, Supabase, Railway, or managed Postgres)

See [deployment-readiness-report.md](deployment-readiness-report.md) for the complete readiness summary.
