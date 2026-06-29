# Apophis SMM Suite — starter

All-in-one internal tool for the agency: **payment follow-up**, **budget tracker**, and **attendance & leave** — the leave engine is wired to the real Apophis policy (casual-lot accrual with expiry, per-occurrence sick, late-arrival payroll lines, merit points).

## Stack (and why)

- **Frontend:** React + TypeScript + Vite (plain CSS, no build-time UI deps so it runs immediately).
- **Backend:** Node + Express + TypeScript, **Prisma + PostgreSQL**.
- **Auth:** JWT, admin login + seeded role accounts. RBAC middleware on every protected route.

Chosen over a no-backend/Supabase MVP because this app has real custom domain logic (lot expiry, sick-occurrence grouping, idempotent month-close, payroll generation) that belongs in one server. Prisma+Postgres runs identically on a $5 VPS, Neon, or Supabase Postgres — no lock-in, keeps the cheap self-host path open.

## Layout

```
api/   Express + Prisma backend
  prisma/schema.prisma   data model
  prisma/seed.ts         real June-2026 team + sample billing/budget
  scripts/import-xlsx.ts importer for the existing attendance workbook
  src/domain/            leave.ts · payroll.ts · kpis.ts  (the real logic)
  src/routes/            auth · billing · budget · attendance · reports
  src/jobs/monthClose.ts grants + merit + payroll (idempotent)
web/   React + Vite frontend (Payments / Budget / Attendance)
docker-compose.yml       local Postgres
```

## Run it

Prerequisites: Node 18+, Docker (for Postgres).

```bash
# 1. database
docker compose up -d

# 2. backend
cd api
cp .env.example .env
npm install
npx prisma migrate dev --name init    # creates tables
npm run seed                           # loads the real team + samples
npm run dev                            # http://localhost:4000

# 3. frontend (new terminal)
cd web
npm install
npm run dev                            # http://localhost:5173
```

Login: **admin@apophis.in / password123** (also `finance@` and `hr@`).

## Demo walkthrough

- **Payments** — board with Pending / In Progress / Paid / Overdue. Status is *reconciled on read*: AP-2026-004 shows **Paid** (full payment) and AP-2026-002 shows **Overdue** (past due, unpaid) even though both are stored `PENDING`. Totals strip + CSV export. **"Send reminders"** emails overdue and due-soon clients (one per kind per 7-day cooldown), badges the card, and logs each run; a daily 9am job does the same automatically.
- **Budget** — KPI tiles (income, expense, net, margin, burn rate, variance vs plan), monthly cash-flow bars, a **net cash-flow forecast** (least-squares trend projecting the next 3 months, dashed), and live add-transaction.
- **Attendance** — June grid color-coded by your codes (P/L/A/WFH/CL/SL/CO…), a leave-approval inbox, CSV/PDF/Payroll-PDF export.
- **My Leave** (self-service) — every employee sees their casual balance broken down by lot (with expiry dates) plus their **WFH monthly quota** (used / 2, up to 4 on merit), files a request (Normal or Planned), and tracks status. The form computes working days (Sundays excluded) and warns up front when a request exceeds the balance and will spill to LOP.

### End-to-end leave demo

This exercises the whole accrual engine through the UI:

1. Sign in as staff — **sneha@apophis.in / password123**. *My Leave* shows **2 days** available (her May lot carried into June + June's lot).
2. File 1 day of Casual leave — it appears as **Pending**.
3. Sign in as **hr@apophis.in** → *Attendance* → approve it in the inbox.
4. Back as Sneha: balance is now **1 day**, the consumed lot updated FIFO (soonest-expiry first). Request a 3-day casual leave and the form flags that **2 days will be LOP** before you even submit.

Nav is role-gated: viewers see only *My Leave*; finance sees Payments/Budget; HR/managers see Attendance.

### Invoice reminders

Click **Send reminders** on the Payments page (or wait for the daily 9am cron). With no email config it runs in **preview mode** — it "sends," logs each message to the API console (`📧 [preview] → …`), and records it — so you can see the whole flow with zero setup. Against the seed it fires two overdue notices (Cafe Aroma AP-2026-001, FitZone AP-2026-002). To go live, set `SMTP_*` in `.env` (e.g. Resend/SendGrid) and it switches to real delivery automatically — no code change.

Then run the month-close to see derived data:

```bash
cd api && npm run month-close 2026 6
```

This grants each employee June's casual lot, computes merit points (+1 no casual, +1 no WFH), and emits idempotent payroll lines (50% late deductions, sick-day LOP). Re-running updates rather than duplicates. Export them: `GET /reports/payroll/export?format=csv`.

## Importing your existing workbook

```bash
cd api
npm run import -- /path/to/Apophis_attendence_jun_2026.xlsx
```

Reads the **Monthly Attendance** sheet, auto-detects month/year, upserts employees by Emp ID, and creates one attendance record per (employee, day) from the status codes. Verified against your June file: 12 employees, 228 records.

## API reference (summary)

```
POST /auth/login · GET /auth/me
GET/POST /clients · PATCH/DELETE /clients/:id
GET/POST /invoices · PATCH /invoices/:id · POST /invoices/:id/payments
GET /dashboard/payments
GET/POST /categories · GET/POST /transactions · PATCH/DELETE /transactions/:id
GET /dashboard/budget?from=&to=
GET /leave-types · GET /balances?userId=
GET/POST /attendance
GET/POST /leave-requests · PATCH /leave-requests/:id/approve|reject
GET /reports/:module/export?format=csv      (payments|budget|attendance|payroll)
POST /admin/month-close                       { year, month }
```

RBAC: ADMIN all · FINANCE billing+budget · HR attendance+leave · MANAGER read+approve · VIEWER read-only.

## Roadmap

- **MVP:** auth+RBAC, all entities, three dashboards, reconciled payment status, lot-based casual accrual, per-occurrence sick (casual rescue), merit, payroll lines, CSV export, xlsx import, self-service leave, email reminders.
- **Phase 2 (done here):** **PDF reports** (payments/budget/attendance/payroll, branded, paginated), **cash-flow forecast line**, **WFH quota** in the leave panel.
- **Phase 2 (remaining):** leave-policy import UI, drag-and-drop board status, SMS reminder channel.
- **Phase 3:** payroll system export format, realtime updates, audit log, per-module scopes, backups.

> Reports export as both CSV and PDF from each dashboard. PDFs use "Rs " rather than the ₹ glyph, which isn't in the standard PDF fonts.
- **Phase 3:** payroll system export format, realtime updates, audit log, per-module scopes, backups.

### Deployment

- **Staging:** web on Vercel/Netlify, API on Render/Railway/Fly, DB on Neon/Supabase; migrate on deploy from `develop`.
- **Production:** separate DB + daily backups + Sentry from `main`. Cheapest durable owned option: one small VPS running API+Postgres+Caddy via Compose (~$5–10/mo).

## Notes & open items

1. **Sick + casual (resolved → interpretation B).** First day of a sick occurrence is free; days 2+ are paid from remaining casual, then LOP. Settled at month-close (`domain/payroll.ts`), recomputed idempotently each run. Voluntary casual leave (via requests) keeps priority on the balance; sick uses the remainder. The *My Leave* panel shows casual available for voluntary leave; sick's draw on it is realised at month-close. June's seed has only single-day sick spells, so the rescue path isn't exercised by the demo data — enter a 2+ day `SICK` spell via `POST /attendance` to see it. **Merit assumption:** merit points key off voluntary CL days in attendance, so being sick never costs merit even when it consumes casual. Flip in `jobs/monthClose.ts` if merit should also penalise sick-driven casual use.
2. **Currency.** Model assumes INR per invoice; add an FX layer if you bill in multiple currencies.
