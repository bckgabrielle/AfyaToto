# Afya Toto Backend

Node.js/Express API with PostgreSQL persistence for mother and child health workflows. The service is isolated from the frontend; the frontend connects through `VITE_API_URL`.

## Run locally

1. Copy `.env.example` to `.env` and replace the JWT and seed passwords.
2. Start PostgreSQL and the API with `docker compose up --build`.
3. The API listens at `http://localhost:4000`; health check: `GET /health`.

The compose startup applies migrations and seeds ANC/immunisation schedules, pending-review starter content, one CHW account, and one administrator. Mothers register with their name, phone, password, due date, and consent, then log in with phone/password. With the example environment, the staff accounts are `chw` / `change-this-password` and `admin` / `change-this-password`; replace both before use beyond local development.

## Groq chat

To enable Groq, put `GROQ_API_KEY=your-key` in `Backend/.env` and optionally set `GROQ_MODEL`. Never put the key in the frontend or commit `.env`. Restart the API with `docker compose up --build -d`. Chat sends the question and its matched approved article to Groq for wording; danger-sign responses and unmatched questions bypass Groq. If the key is absent or Groq is unavailable, the approved article text is returned directly. The chat screen discloses this processing; avoid sending identifying details and review provider privacy terms before production use.

Mother registration collects consent and the expected delivery date before opening pregnancy views. `PATCH /api/mother/profile` remains available for later profile updates; the API does not guess clinical dates.

For a separately managed PostgreSQL instance, set `DATABASE_URL`, install dependencies with `npm install`, then run `npm run db:migrate`, `npm run db:seed`, and `npm start`.

## API

All JSON APIs are under `/api`. Browser authentication uses an HttpOnly `at_session` cookie; credentialed CORS is restricted to `FRONTEND_ORIGIN`. `Authorization: Bearer <token>` remains supported for non-browser API clients.

| Method           | Path                                         | Purpose                                                         |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------- |
| POST             | `/auth/otp/request`, `/auth/otp/verify`      | Legacy OTP endpoints; not used by the frontend                  |
| POST             | `/auth/register`                             | Register a mother and save profile/consent                      |
| POST             | `/auth/login`                                | Mother phone/password or staff username/password login          |
| POST             | `/auth/logout`                               | Clear the browser session cookie                                |
| GET              | `/auth/me`                                   | Resolve current session                                         |
| GET, PATCH       | `/mother/profile`                            | Read/update mother profile and consent                          |
| GET, POST        | `/maternal-records`                          | Read or record pregnancy, ANC, PNC, and danger-sign data        |
| GET, POST        | `/children`                                  | List or register children; registration schedules immunisations |
| POST             | `/children/:childId/immunizations`           | Record a vaccine dose                                           |
| GET              | `/appointments`                              | List visible appointments                                       |
| PATCH            | `/appointments/:appointmentId/status`        | Update appointment status                                       |
| GET              | `/reminders`                                 | List delivered in-app reminders                                 |
| PATCH            | `/reminders/:reminderId/read`                | Mark reminder read                                              |
| GET              | `/health-content?lang=en`                    | Retrieve approved health information                            |
| POST             | `/chat`                                      | Match against approved content and escalate danger terms        |
| GET              | `/chw/dashboard`, `/chw/mothers`             | CHW follow-up dashboard and assigned mothers                    |
| GET              | `/chw/contacts`                              | Follow-up contact history                                       |
| POST             | `/chw/appointments/:appointmentId/contact`   | Record a CHW follow-up contact                                  |
| GET, POST        | `/admin/chws`                                | List or create CHW accounts                                     |
| GET, PATCH       | `/admin/mothers`, `/admin/mothers/:motherId` | Assign CHW and manage mother profile                            |
| GET, POST, PATCH | `/admin/health-content`                      | Maintain content; edits require a fresh review                  |
| GET, PATCH       | `/admin/schedule-rules`                      | Read and update ANC/immunisation rules                          |

## Data and access

The SQL migrations are in `db/migrations/`. They define accounts, mother/CHW profiles, consent, maternal records, children, schedule rules, appointments, immunisation records, approved content, reminders, follow-up contacts, chat events, and audit events. Mothers can only access their own records; CHWs are scoped to assigned mothers; administrators manage assignments and reviewed content. Passwords and OTPs are hashed, OTP challenges expire after five minutes and are attempt-limited, and API routes use role checks, validation, rate limiting, Helmet, and parameterized SQL.

Change the sample credentials and `JWT_SECRET` before deployment. Configure `FRONTEND_ORIGIN` to the deployed frontend origin. If the frontend and API are on different sites, use HTTPS and set `COOKIE_SAME_SITE=None`; same-site deployments can keep `Lax`. Clinical content and schedule rules must be reviewed by qualified local health authorities before production use.
