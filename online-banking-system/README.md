# Online Banking System

Full-stack online banking application: a customer web app and an admin
console on top of one REST API. Built for VIT Chennai, BCSE301L (Software
Engineering) against the SRS, DFDs, ER diagram, state-transition and sequence
diagrams produced in Exp-1 to Exp-7.

**Version 2.0 is the complete system (Phase 1 + Phase 2).** The Phase 1 build
(accounts, beneficiaries, transfers, bill payments, deposits) is kept in Git as
the tag `v1.0-phase1`.

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + React Router 6 |
| Backend | Node.js + Express 4, REST + JSON |
| Auth | JWT, bcrypt-hashed passwords and MPINs, OTP second factor |
| ORM / DB | Sequelize 6 &mdash; SQLite for local use, MySQL as the production target |
| Statements | CSV and PDF (pdfkit) |
| Tests | 96 API tests (`node --test`) + 33 browser tests (Playwright) |

## What it does

### Customer app

| Module | Highlights |
|---|---|
| **Sign in** | Password, then a 6-digit OTP (shown on screen in a "demo mode" box &mdash; no SMS gateway). Lockout after 5 wrong passwords. Idle sign-out after 5 minutes with a 30-second "Stay signed in" warning. Dashboard shows your previous sign-in. |
| **Accounts** | Every account you hold, including joint accounts, with masked numbers (full number on request, hides itself after 15 s). Transaction history with money in *and* out, filters by date / type / direction, running-balance **CSV and PDF statements**. |
| **Beneficiaries** | Add / edit / remove; a new payee has a cooling-off period before it can be paid; optional per-payee limit. |
| **Transfers** | Own-account, IMPS, NEFT, RTGS with per-mode limits (IMPS &le; &#8377;5,00,000, NEFT &le; &#8377;25,00,000, RTGS &ge; &#8377;2,00,000). Every transfer is validated, shown back in plain words, and confirmed with the **MPIN**. Debit and credit alerts go to every holder of a joint account. |
| **Bills & recharge** | Saved billers, direct recharge, payment history. |
| **Deposits** | Fixed and Recurring Deposits, maturity calculator, RD instalments, premature closure with a 1-point rate penalty. Opening and closing need the MPIN. |
| **Loans** | Personal 11.5 %, Education 9.5 %, Vehicle 9.0 %, Home 8.5 %. Live EMI calculator with the full amortisation schedule, pre-approved offer, application, status tracking, and EMI payment with the MPIN. |
| **Cards** | Debit and credit cards: per-card daily limits within product ceilings, channel switches (ATM, POS / in-store, online, international), instant block, and a service-request flow to get a card unblocked and re-issued. |
| **Service requests** | Raise requests (reference `SR` + 6 digits), follow them from Open to Resolved / Closed, read the bank's resolution notes. Closed requests are final. |
| **Notifications** | In-app inbox with categories and unread badge, preferences (alert threshold, categories, promotional opt-out). |
| **Profile** | Read-only KYC details, editable contact details, MPIN set / change. |

### Admin console

Overview dashboard with attention cards; customer management (create, edit,
deactivate / activate, unlock); a transaction monitor with filters, flagging and
review; loan approval and rejection (approval credits the customer and creates
the EMI schedule; rejection needs a reason); service-request queue with
resolution notes; reports with charts and CSV export; a searchable activity
(audit) log; and broadcast notifications that respect customers' opt-outs.

### Design decisions worth knowing

- **One ledger.** Every movement of money is a row in `transactions`
  (transfers, bills, deposits, loan disbursals and EMIs). Statements, history and
  reports are all computed from it, so they always agree.
- **Pending &rarr; confirm.** A transfer or payment is stored as `Pending` after
  validation and can only be executed once, by confirming with the MPIN. This closes
  a replay hole found in Phase 1 testing.
- **Lazy time-based rules.** Cooling-off expiry, deposit maturity and RD instalments
  are applied when data is read, so no background scheduler is needed.
- **Money is rounded to the paisa** at every step, so balances stay exact.
- **Concrete values for SRS "TBD" items** (interest-rate bands, penalty, mode limits,
  loan products) live in the service files and can be changed there.

## Quick start

Requires **Node.js 18+**. Two terminals.

```bash
# 1. API  (http://localhost:4000)
cd backend
cp .env.example .env
npm install
npm run seed        # creates data/obs.sqlite with demo data
npm run dev

# 2. Web app  (http://localhost:5173)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Check the API: `curl http://localhost:4000/api/health`

> **Upgrading a Phase 1 database?** There are no migrations. Run `npm run seed`
> again (it rebuilds the demo data). The API refuses to start against an old schema
> with a message saying so, rather than failing halfway through a request.
> `npm run db:reset` gives an empty database with only the admin user.

### Demo logins (after `npm run seed`)

Password for every customer: `Customer@123`. Admin: `admin` / `Admin@123`.

| User | MPIN | What they have |
|---|---|---|
| `priya` | `1234` | Savings account (&#8377;85,000), debit + credit card, an active loan, an FD and an RD, a beneficiary still cooling off |
| `arjun` | `4321` | A **joint** account with Kavya (&#8377;1,52,000) plus a solo account; a blocked card awaiting re-issue; alert threshold &#8377;5,000 |
| `kavya` | `5678` | Joint-account holder; promotional notifications switched off |
| `meera` | `2468` | Savings account (&#8377;3,20,000), a home loan, a credit card |
| `rohan` | `1357` | A **deactivated** customer, to show that sign-in is refused |
| `admin` | &mdash; | Admin console at `/admin` |

The login screen is the only place the OTP appears, in the amber "Demo mode" box.

## Configuration

**`backend/.env`** (see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_DIALECT` | `sqlite` | `sqlite` or `mysql` |
| `DB_STORAGE` | `./data/obs.sqlite` | SQLite file |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | &mdash; | MySQL connection (only when `DB_DIALECT=mysql`) |
| `JWT_SECRET` | *(change it)* | Signing key for session tokens |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `OTP_EXPIRY_SECONDS` | `300` | OTP validity |
| `BENEFICIARY_COOLING_PERIOD_MINUTES` | `30` | Cooling-off before a new payee can be paid |
| `MPIN_MAX_ATTEMPTS` / `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | `3` / `5` / `15` | Lockout rules |
| `CBS_SIMULATED_FAILURE_RATE` | `0` | Chance (0&ndash;1) the simulated core banking system declines a posting. `0.05` shows the failure path now and then. |
| `RTGS_MIN_AMOUNT` / `IMPS_MAX_AMOUNT` / `NEFT_MAX_AMOUNT` | `200000` / `500000` / `2500000` | Per-mode transfer limits |

**`frontend/.env`**: `VITE_API_URL` (default `http://localhost:4000/api`),
`VITE_IDLE_SECONDS` (default 300) and `VITE_IDLE_WARN_SECONDS` (default 30) for the
inactivity sign-out.

### Switching to MySQL

Model code does not change. In `backend/.env` set `DB_DIALECT=mysql` and the
`DB_*` connection values, create the database
(`CREATE DATABASE online_banking_system;`), then `npm run seed`. For a real
production system, replace `sequelize.sync()` in `src/server.js` with versioned
migrations.

## Tests

```bash
# API: 96 tests, each file against its own throw-away SQLite database
cd backend && npm test

# Browser: drives the real UI in Chromium (optional extra install)
cd e2e && npm install && npx playwright install chromium
npm test                  # all files
npm test -- admin         # only files whose name contains "admin"
```

The browser runner seeds a fresh database, starts the API and two copies of the
UI (one with a 6-second idle limit for the sign-out test), and stops everything
afterwards. It covers the customer flows, the admin console, idle sign-out, and
a phone-width / desktop-width sweep of every page that checks for sideways
scrolling, unnamed controls, and console errors.

## API reference

All routes are under `/api`. "Customer" and "Admin" routes need
`Authorization: Bearer <token>` from the two-step login. Errors are
`{ "error": "message" }` with a suitable status code.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /auth/login` &middot; `POST /auth/verify-otp` &middot; `POST /auth/forgot-password` &middot; `POST /auth/reset-password` &middot; `POST /auth/logout` &middot; `GET /auth/me` &middot; `POST /auth/mpin` |
| **Accounts** | `GET /accounts` &middot; `GET /accounts/:id` &middot; `GET /accounts/:id/transactions?from&to&type&direction` &middot; `GET /accounts/:id/statement?from&to&format=csv\|pdf` |
| **Profile** | `GET /profile` &middot; `PUT /profile` (contact fields only) |
| **Beneficiaries** | `GET /beneficiaries` &middot; `POST /beneficiaries` &middot; `PUT /beneficiaries/:id` &middot; `DELETE /beneficiaries/:id` |
| **Transfers** | `POST /transfers/initiate` &middot; `POST /transfers/confirm` `{transactionId, mpin}` &middot; `GET /transfers/:id` |
| **Bills** | `GET\|POST /bills/billers` &middot; `DELETE /bills/billers/:id` &middot; `POST /bills/pay/initiate` &middot; `POST /bills/pay/confirm` &middot; `GET /bills/pay/history` |
| **Deposits** | `GET /deposits` &middot; `POST /deposits` (needs `mpin`) &middot; `GET /deposits/:id` &middot; `POST /deposits/:id/close` (needs `mpin`) |
| **Loans** | `GET /loans/offers` &middot; `POST /loans/calculate` &middot; `GET /loans` &middot; `POST /loans` &middot; `GET /loans/:id` &middot; `POST /loans/:id/pay-emi` (needs `mpin`) |
| **Cards** | `GET /cards` &middot; `GET /cards/:id` &middot; `POST /cards/:id/block` &middot; `POST /cards/:id/request-unblock` &middot; `PUT /cards/:id/limits` &middot; `PUT /cards/:id/channels` |
| **Service requests** | `GET /service-requests` &middot; `POST /service-requests` &middot; `GET /service-requests/:id` &middot; `POST /service-requests/:id/close` |
| **Notifications** | `GET /notifications` &middot; `GET /notifications/unread-count` &middot; `POST /notifications/:id/read` &middot; `POST /notifications/read-all` &middot; `GET\|PUT /notifications/preferences` |
| **Admin** | `GET /admin/overview` &middot; `GET\|POST /admin/users` &middot; `GET\|PUT /admin/users/:id` &middot; `POST /admin/users/:id/(deactivate\|activate\|unlock)` &middot; `GET /admin/transactions` &middot; `GET\|POST /admin/flags` &middot; `POST /admin/flags/:id/clear` &middot; `GET /admin/loans` &middot; `POST /admin/loans/:id/(approve\|reject)` &middot; `GET /admin/service-requests` &middot; `GET\|PUT /admin/service-requests/:id` &middot; `GET /admin/reports/summary` &middot; `GET /admin/activity-log` &middot; `POST /admin/notifications/broadcast` |

The OTP is returned in the login response as `devOtp` because there is no live
SMS/email gateway. Remove that field before any real deployment.

## Project structure

```
backend/
  src/
    config/        SQLite / MySQL switch
    models/        Sequelize models and associations
    middleware/    JWT auth, role guard, error handler
    routes/        one router per module, mounted in app.js
    controllers/   thin HTTP layer
    services/      business rules (auth, accounts, beneficiary, transfer, bill,
                   deposit, loan, card, serviceRequest, notification,
                   statement, admin)
    utils/         ledger, EMI maths, MPIN lockout, notifications, masking,
                   CBS simulator, schema check, pagination
  seed/            seed.js (demo data), reset.js (admin only)
  tests/           API tests
frontend/
  src/
    api/           axios client + one function per endpoint
    components/    Layout, AdminLayout, Modal / MpinModal / ConfirmModal, Field, StatusBadge
    context/       AuthContext
    hooks/         useLoad, useIdleLogout, useDialog
    pages/         customer pages; admin/ for the console
    utils/         formatting and masking helpers
e2e/               Playwright tests and runner
```

## Known limits

- OTP and core banking are simulated; there is no real SMS, email or payment network.
- Card numbers are generated for demonstration; no real card processing.
- Schema is created with `sequelize.sync()`; use migrations for production.
- `JWT_SECRET` in `.env.example` is a placeholder and must be replaced.
