# Afya Toto: Frontend

React + Vite. Two experiences: **mother app** (primary users) and **CHW/supervisor dashboard**.

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

By default the app connects to `http://localhost:4000`. Start the backend from `../Backend` with `docker compose up --build`.

For UI-only development, set `VITE_DEMO_MODE=true` in `.env` and restart Vite. In demo mode, register a mother account with any phone and password; CHW = `chw` / `chw123`; administrator = `admin` / `admin123`. Demo mode is disabled in production builds and never activates just because the API URL is missing.

## Connect the backend

Set `VITE_API_URL` in `.env` if the backend is not at the default URL. The browser uses credentialed requests and the backend sets an HttpOnly session cookie; JavaScript does not store the auth token.

All calls are in `src/api.js`. The backend provides:

| Method     | Path                                                     | Body                                      | Returns                                        |
| ---------- | -------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| POST       | /api/auth/register                                       | mother details                            | Save mother profile and return HttpOnly cookie |
| POST       | /api/auth/login                                          | {phone, password} or {username, password} | {role, user} and HttpOnly cookie               |
| GET        | /api/auth/me                                             | —                                         | Current role and user                          |
| GET, PATCH | /api/mother/profile                                      | profile data                              | Consent and profile setup                      |
| GET        | /api/appointments, /api/maternal-records, /api/reminders | —                                         | Mother-specific records                        |
| GET, POST  | /api/children                                            | child data                                | Child profiles and immunisation schedule       |
| POST       | /api/children/:childId/immunizations                     | vaccine data                              | Record a child vaccine dose                    |
| PATCH      | /api/appointments/:id/status                             | {status}                                  | Record appointment attendance                  |
| POST       | /api/chat                                                | {message, lang}                           | {answer, escalate} (approved database content) |
| GET        | /api/chw/dashboard, /api/chw/mothers, /api/children      | —                                         | Assigned follow-up data                        |
| POST       | /api/chw/appointments/:id/contact                        | {note?}                                   | Persisted follow-up contact                    |

**Security:** Groq and Africa's Talking keys belong in `Backend/.env` only, never in this frontend.

## Low-bandwidth features

Small bundle, health-worker code loaded only when needed, and a production service worker for the app shell. API data is not cached and offline edits are not queued; the app warns that data may be stale and changes will not save. English and Kiswahili are available; health leads must review the Swahili.

## Push to GitHub

```bash
git add . && git commit -m "Mother app, auth, chat" && git push
```
