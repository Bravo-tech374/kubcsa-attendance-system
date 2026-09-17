# KUBCSA Smart Attendance

A secure attendance platform for the Kisii University Bungoma County Students Association.

- `frontend/`: Next.js dashboard and responsive attendance experience
- `backend/`: Express + TypeScript API
- `prisma/`: Prisma schema and migration definitions
- `docs/`: local setup, security notes, and deployment guidance

## Local development

```powershell
cd backend
Copy-Item .env.example .env
npm install
npx prisma generate --schema=../prisma/schema.prisma
npx prisma migrate dev --schema=../prisma/schema.prisma --name init
npx tsx src/seed.ts
npm run dev
```

In another terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Application URLs:
- Frontend: http://localhost:3000/login
- API: http://localhost:4000/health

## Production deployment

This project is production-ready only when the following are completed:

1. PostgreSQL database is configured and `DATABASE_URL` points to PostgreSQL
2. `JWT_SECRET` and `JWT_REFRESH_SECRET` are set to strong secrets in production
3. `FRONTEND_URL` is set to the deployed frontend origin
4. `NEXT_PUBLIC_API_URL` is set to the deployed backend origin
5. `npm run build` succeeds for both backend and frontend
6. Database migrations run with `prisma migrate deploy` before startup
7. HTTPS, rate limiting, and secure headers are enabled in the deployed environment

See [docs/README.md](docs/README.md) and [docs/deployment-readiness-report.md](docs/deployment-readiness-report.md) for a full deployment readiness report and host recommendations.
