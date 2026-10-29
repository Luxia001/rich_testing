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
| `POST` | `/auth/register` | Creates a user (`{ "email", "password" }`) |
| `POST` | `/auth/login` | Login (`{ "email", "password", "rememberMe": true }`) |
| `POST` | `/auth/logout` | Revokes current session and clears cookie |
| `GET` | `/auth/me` | Returns current user |
| `GET` | `/admin/sessions` | Admin-only recent session records |

The schema includes `displayName` (currently defaults to the email prefix for registration) and a `RefreshToken` model for planned token rotation. Full refresh/logout behavior from `SYSTEM_DESIGN_PLAN.md` remains a separate implementation step.

Import `postman/be_login.postman_collection.json` into Postman to use the prepared requests. Postman stores the `access_token` cookie after Login and sends it automatically on `/auth/me`, `/auth/logout`, and admin requests. Both demo accounts use the `DEMO_ACCOUNT_PASSWORD` from `.env`.

## Authentication configuration

- Passwords use Argon2id. Public registration requires at least 12 characters; the local demo seed uses the requested `Demo123!` password.
- JWT is stored in an `HttpOnly`, `SameSite=Lax` cookie.
- Session defaults are 8 hours, or 30 days with `rememberMe=true`.
- Use `COOKIE_SECURE=true` behind HTTPS in production; `false` is for local HTTP only.
- Registration assigns `user`; promote administrators only through a trusted SQL operation.

## Build and run

```sh
npm run typecheck
npm run build
npm start
```

Frontend integration เพิ่ม /auth/me metadata: {user,expiresAt,rememberMe} สำหรับ restore UI ผ่าน HttpOnly cookie ใช้ Angular proxy /api -> localhost:8000 ไม่มีการเปิด CORS ทุก origin
Logout รองรับ cookie หมดอายุและการทำซ้ำ; non-remembered cookie ไม่ตั้ง Max-Age ส่วน remembered cookie คงอายุตาม TTL
ตั้ง FRONTEND_ORIGINS เป็นรายการ origin ที่อนุญาตคั่นด้วย comma เมื่อใช้ origin นอก localhost:4200/127.0.0.1:4200 และตั้ง COOKIE_SECURE=true สำหรับ production HTTPS
ทดสอบ integration ด้วย node --experimental-strip-types tests/auth.integration.mjs (ต้องมี MySQL และบัญชี demo ที่ seed แล้ว)
