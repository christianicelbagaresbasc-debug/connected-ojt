# ConnectEd OJT

ConnectEd organizes OJT student registration, university approval, company verification, opportunities, applications, document review, and placement confirmation for Bulacan State Agricultural University (BSAU).

The system supports five roles: OJT Coordinator, Co-OJT Coordinator, Student, Company representative, and Attorney. Company accounts are provisioned by coordinators; companies cannot self-register. Opportunity suggestions match a student's selected skills to required skills and never rank applicants against each other. A student may hold only one active placement, and a company acceptance does not itself create a placement.

## Local setup

Requirements: Node.js 20+, npm, and PostgreSQL (Neon works).

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, `DIRECT_URL`, and a random `SESSION_SECRET` of at least 32 bytes. Set the coordinator seed email and initial password. Set `SEED_DEMO=true` to load sample records.
3. Apply migrations with `npx prisma migrate deploy`.
4. Seed accounts and the skill catalog with `npm run db:seed`.
5. Start the app using `npm run dev` and open `http://localhost:3000`.

The initial coordinator must change the temporary password at first sign-in. Never commit `.env` or paste secrets into source files.

## Demo data

When `SEED_DEMO=true`, the seed adds five demo role accounts, five sample students, four sample companies, sample opportunities, and applications. Demo users use `demo.*@connected.test` email addresses. A shared password is generated if `SEED_DEMO_PASSWORD` is not set and printed once by the seed command. Set `SEED_DEMO_PASSWORD` to choose a known value. Use `npm run db:unseed-demo` to remove demo users and sample companies.

## Roles and main flow

- Coordinators approve student accounts, assign Co-Coordinators, maintain company records, verify companies, create logins, oversee applications, and confirm placements.
- Co-Coordinators work with assigned students and review their applications.
- Students maintain a profile, browse verified companies and opportunities, apply, respond to offers, and submit OJT documents.
- Verified company representatives maintain opportunities and review applicants.
- Attorneys review documents that require legal approval.

Main flow: a student registers and completes a profile; a coordinator approves the student and verifies a company; the company posts an opportunity and reviews applications; after acceptance, the student confirms, legal documents are reviewed, and a coordinator confirms placement.

## Commands

- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript checks
- `npm test` — pure workflow and matching tests
- `npm run build` — production build
- `npm run db:seed` — idempotent catalog/account/demo seeding
- `npm run db:unseed-demo` — remove sample data

## Deployment

The app targets Vercel in Singapore (`sin1`) and Neon PostgreSQL in Singapore. Configure `DATABASE_URL`, `DIRECT_URL`, and `SESSION_SECRET` in Vercel for Production, Preview, and Development. `vercel-build` generates Prisma Client, applies migrations, and builds the site. Seed the production coordinator and optional demo data once from a secure local environment. Pushes to `main` deploy automatically when the Vercel GitHub integration is connected.

The proposal describes PHP/MySQL/Apache; this deployment uses Next.js 15, TypeScript, and PostgreSQL because Vercel does not run the proposed PHP stack. Attorney and Co-Coordinator are included as additional roles. Uploaded files are stored in PostgreSQL because Vercel's local filesystem is ephemeral. Notifications are in-app only; there is no email, messaging, payroll, attendance/DTR, or native mobile app. Password recovery is coordinator-managed because no password-reset email is configured.

Footer: BSAU Institute of Computer Studies, Pinaod, San Ildefonso, Bulacan.
