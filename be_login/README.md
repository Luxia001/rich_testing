# be_login API

Express 5 + TypeScript API using Prisma ORM and MySQL. The Prisma schema defines users, sessions, and refresh-token rotation records based on `SYSTEM_DESIGN_PLAN.md`.

## MySQL setup

The API expects MySQL on `127.0.0.1:3306`, database `be_login`, username `root`, and the password configured in `.env`.

1. Start MySQL and run `db/create-database.sql` as a user with permission to create `be_login`.
2. Copy `.env.example` to `.env`, set the MySQL password and a private `JWT_SECRET` of at least 32 random bytes.
3. Run `npm install`, `npm run db:generate`, and `npm run db:migrate -- --name initial_schema`.
4. Set `DEMO_ACCOUNT_PASSWORD` in `.env`, then run `npm run db:seed`.
5. Run `npm run dev`.

## Prisma workflow

- Edit `prisma/schema.prisma` when changing tables or relations.
- Run `npm run db:migrate -- --name describe_change` to create and apply a migration in development.
- Commit generated files under `prisma/migrations/` with the code change.
- Run `npm run db:deploy` to apply committed migrations in a deployment environment.
- Run `npm run db:studio` to inspect the database with Prisma Studio.
- Run `npm run db:seed` to create/update `user@rich.demo` and `admin@rich.demo`. It hashes the demo password with Argon2id and is blocked when `NODE_ENV=production`.

Do not use `db push` for shared environments; migrations provide a reviewable history.

## Project layout

```text
src/
  app.ts                     # Express app and middleware wiring
  server.ts                  # Process startup and graceful shutdown
  config/                    # Environment validation and Prisma Client
  features/auth/              # Login/register controllers, routes, validation, service
  features/admin/             # Admin-only endpoints and queries
  middleware/                 # Authentication, role checks, errors and 404
  scripts/                    # One-off tasks such as admin seeding
  types/                      # Express request type extensions
  utils/                      # Cookie helpers
prisma/schema.prisma          # MySQL data model
prisma/migrations/            # Ordered Prisma SQL migrations
db/                           # Database bootstrap scripts
```

## Existing authentication endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Checks API and database availability |
| `GET` | `/docs` | Swagger UI interactive API documentation |
| `GET` | `/openapi.json` | OpenAPI 3 specification |
| `POST` | `/auth/register` | Creates a user (`{ "email", "password" }`) |
| `POST` | `/auth/login` | Login (`{ "email", "password", "rememberMe": true }`) |
| `POST` | `/auth/refresh` | Rotates remember-me refresh token and returns a new access token |
| `POST` | `/auth/logout` | Revokes session using Bearer access token or refresh cookie |
| `GET` | `/auth/me` | Returns current user |
| `GET` | `/admin/sessions` | Admin-only recent session records |

### Error response

All API errors use `{ "error": { "code": "...", "message": "..." } }`. Common codes are `VALIDATION_ERROR` (400), `AUTH_REQUIRED` (401), `ACCESS_EXPIRED` (401), `SESSION_REVOKED` (401), `REFRESH_INVALID` / `REFRESH_REUSED` (401), `FORBIDDEN` (403), `RATE_LIMITED` (429), `NOT_FOUND` (404), and `INTERNAL_SERVER_ERROR` (500). Invalid login uses `INVALID_CREDENTIALS` with a generic message.

The schema includes `displayName` (currently defaults to the email prefix for registration) and refresh-token rotation records. Refresh tokens are random opaque values in an HttpOnly cookie; only SHA-256 hashes are stored in MySQL. Reusing a rotated token revokes its whole session.

Import `postman/be_login.postman_collection.json` into Postman to use the prepared requests. Set the returned `accessToken` as a Bearer token for protected requests. Postman retains the HttpOnly refresh cookie for refresh/logout. Both demo accounts use the `DEMO_ACCOUNT_PASSWORD` from `.env`.

Open Swagger UI at `http://localhost:4200/api/docs` through the Angular proxy when testing refresh cookies. The direct API docs at `http://localhost:8000/docs` are available for other calls, but the default refresh cookie is scoped to `/api/auth`. The UI loads its static bundle from the pinned Swagger UI CDN; `/openapi.json` remains available if the browser cannot reach that CDN.

## Authentication configuration

- Passwords use Argon2id. Public registration requires at least 12 characters; the local demo seed uses the requested `Demo123!` password.
- Access JWT defaults to 60 seconds, is returned in the response body, and must be kept in client memory and sent as `Authorization: Bearer <accessToken>`.
- `rememberMe=true` creates a session valid up to 90 seconds. Each refresh token is valid up to 90 seconds or the session deadline, whichever comes first. Rotation does not extend the 90-second session maximum. Without remember me, no refresh token is issued.
- Refresh cookie defaults to `Path=/api/auth` for the Angular `/api` proxy. Set `REFRESH_COOKIE_PATH=/auth` only when calling Express directly without the proxy.
- Without Remember Me, the session expires with the access token (`ACCESS_TTL_SECONDS`). With Remember Me, it expires after at most 90 seconds.
- `/auth/me` does not refresh tokens itself. When it returns `ACCESS_EXPIRED`, the client calls `/auth/refresh` with the HttpOnly cookie, saves the returned access token, then retries `/auth/me` once. With these demo values, wait 60 seconds before `/auth/me`; refresh remains valid until the 90-second session deadline.
- Use `COOKIE_SECURE=true` behind HTTPS in production; `false` is for local HTTP only.
- Registration assigns `user`; promote administrators only through a trusted SQL operation.

## Build and run

```sh
npm run typecheck
npm run build
npm start
```

Frontend uses Angular proxy /api -> localhost:8000. Access JWT is sent as Bearer from in-memory state; refresh token remains in an HttpOnly cookie.
Logout supports an expired Bearer access token when the refresh cookie is present and is safe to repeat.
ตั้ง FRONTEND_ORIGINS เป็นรายการ origin ที่อนุญาตคั่นด้วย comma เมื่อใช้ origin นอก localhost:4200/127.0.0.1:4200 และตั้ง COOKIE_SECURE=true สำหรับ production HTTPS
ทดสอบ integration ด้วย node --experimental-strip-types tests/auth.integration.mjs (ต้องมี MySQL และบัญชี demo ที่ seed แล้ว)
