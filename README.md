# rich_testing — Authentication & Role-Based Access

ระบบเข้าสู่ระบบด้วย Angular และ Express รองรับบัญชี User/Admin, Remember Me, Dashboard ตาม Role และ Logout ที่เพิกถอน Session ในฐานข้อมูล

README นี้อธิบายโค้ดปัจจุบัน ส่วนแนวทาง Access/Refresh Token ฉบับเต็มอยู่ใน [แผนออกแบบระบบ](SYSTEM_DESIGN_PLAN.md) และข้อกำหนดต้นฉบับอยู่ใน [Doc.txt](Doc.txt)

## ภาพรวมโปรเจกต์

| ส่วน | เทคโนโลยี | หน้าที่ |
| --- | --- | --- |
| FE: `Login/` | Angular 20 + TypeScript | Login, Dashboard, Route Guards และสถานะผู้ใช้ |
| BE: `be_login/` | Node.js + Express 5 + TypeScript | ตรวจรหัสผ่าน ออก JWT ตรวจ Role และจัดการ Session |
| Database | MySQL + Prisma ORM | เก็บผู้ใช้ Password Hash และ Session |

```mermaid
flowchart LR
    U[ผู้ใช้] --> FE[Angular :4200]
    FE -->|/api ผ่าน development proxy| BE[Express :8000]
    BE --> P[Prisma ORM]
    P --> DB[(MySQL :3306)]
```

Frontend เรียก `/api/auth/...` ผ่าน Proxy ซึ่งตัด `/api` แล้วส่งไป Backend เช่น `/api/auth/login` → `http://localhost:8000/auth/login`

## การทำงานปัจจุบัน

1. ผู้ใช้กรอก Email, Password และเลือก Remember Me
2. Backend ตรวจรหัสผ่านด้วย Argon2id และตรวจสถานะบัญชี
3. เมื่อสำเร็จ สร้าง Session ใน MySQL และส่ง JWT ผ่าน Cookie `access_token` แบบ HttpOnly, SameSite=Lax
4. Angular รับข้อมูลผู้ใช้และวันหมดอายุ แล้วนำ User ไป `/user` หรือ Admin ไป `/admin`
5. เมื่อเรียก Protected API Backend ตรวจ JWT, Session และ Role ปัจจุบันในฐานข้อมูล การแก้ Role ฝั่งหน้าจอไม่ทำให้ได้รับสิทธิ์เพิ่ม
6. เมื่อเปิดหรือรีโหลดหน้า Angular ตรวจสถานะผ่าน `GET /auth/me` โดยใช้ Cookie ที่ Browser ส่งให้
7. เมื่อ Logout Backend เพิกถอน Session และล้าง Cookie ทำให้ Token เดิมเรียก Protected API ต่อไม่ได้

| การตั้งค่า | ไม่เลือก Remember Me | เลือก Remember Me |
| --- | --- | --- |
| อายุ JWT/Session เริ่มต้น | 8 ชั่วโมง | 30 วัน |
| Cookie | Session Cookie ไม่ตั้ง Max-Age | Persistent Cookie ตามอายุ Session |
| รีโหลดหน้า | คืนสถานะได้หาก Cookie และ Session ยังใช้ได้ | คืนสถานะได้หาก Cookie และ Session ยังใช้ได้ |
| เมื่อ JWT/Session หมดอายุ | กลับ Login | กลับ Login |

ปัจจุบันยังไม่มี `POST /auth/refresh` และไม่มีการออก Token ใหม่อัตโนมัติ เมธอด `refresh()` ใน Frontend เป็นการตรวจ `/auth/me` เท่านั้น ตาราง Refresh Token มีใน Prisma Schema เพื่อรองรับงานขั้นต่อไป การปิด Browser ไม่รับประกันว่า Session Cookie จะหายเสมอ เพราะ Browser อาจคืนสถานะเดิม

## สิ่งที่ต้องเตรียม

- Node.js 22.12 ขึ้นไปในสาย 22 หรือ Node.js 24 LTS พร้อม npm เพื่อรองรับ Angular และคำสั่งรัน TypeScript ของ Backend
- MySQL ที่เปิดใช้งานอยู่ เช่น `localhost:3306`
- Git สำหรับ Clone และ MySQL Client หรือเครื่องมือจัดการฐานข้อมูลสำหรับรัน SQL
- เปิด Terminal ที่โฟลเดอร์หลักของโปรเจกต์

ตัวอย่างคำสั่งในเอกสารใช้ PowerShell บน Windows ตรวจเครื่องมือก่อนเริ่ม:

```powershell
node --version
npm --version
mysql --version
```

หาก `mysql` ไม่อยู่ใน PATH สามารถรัน SQL ผ่าน MySQL Workbench หรือเครื่องมือฐานข้อมูลที่ใช้อยู่แทนได้

## 1. ดาวน์โหลดโปรเจกต์

```powershell
git clone https://github.com/Luxia001/rich_testing.git
cd rich_testing
```

หากมีโปรเจกต์อยู่แล้ว ให้เปิด Terminal ที่โฟลเดอร์นั้นได้เลย คู่มือนี้ต้องมีทั้งโฟลเดอร์ `Login/` และ `be_login/` ในเครื่อง หาก Clone มาแล้วมีเพียง README ต้องนำ Source Code ขึ้น Repository ก่อน

## 2. ตั้งค่าและเริ่ม Backend (BE)

### 2.1 ติดตั้ง Dependencies และสร้างไฟล์ Environment

จากโฟลเดอร์หลัก:

```powershell
cd be_login
npm install
Copy-Item .env.example .env
```

คัดลอก `.env.example` เฉพาะการตั้งค่าครั้งแรก หากมี `.env` แล้วให้แก้ไฟล์เดิมเพื่อรักษาค่าที่ตั้งไว้

ตัวอย่าง `.env` สำหรับ Local:

```dotenv
PORT=8000
DATABASE_URL="mysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/be_login"
JWT_SECRET=REPLACE_WITH_YOUR_GENERATED_SECRET
SESSION_TTL_SECONDS=28800
REMEMBER_ME_TTL_SECONDS=2592000
COOKIE_SECURE=false
DEMO_ACCOUNT_PASSWORD=Demo123!
FRONTEND_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
```

- เปลี่ยนชื่อผู้ใช้และรหัสผ่านใน `DATABASE_URL` ให้ตรงกับ MySQL ของเครื่อง หากรหัสผ่านมีอักขระพิเศษให้ URL-encode ส่วนรหัสผ่าน
- สร้าง Secret แล้วนำผลลัพธ์ไปแทน `JWT_SECRET` ซึ่งต้องมีอย่างน้อย 32 bytes:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- `COOKIE_SECURE=false` ใช้กับ Local HTTP เมื่อให้บริการผ่าน HTTPS ให้ใช้ `true`
- `FRONTEND_ORIGINS` คือ Origin ที่อนุญาตสำหรับคำขอเปลี่ยนแปลงข้อมูล ไม่ใช่การเปิด CORS ทั่วไป
- เก็บ `.env` ไว้ในเครื่อง ไม่อัปโหลดความลับขึ้น Git

### 2.2 สร้างฐานข้อมูล

เปิด MySQL Client:

```powershell
mysql -u root -p
```

จากนั้นรัน SQL:

```sql
CREATE DATABASE IF NOT EXISTS be_login
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

ใช้ SQL เดียวกันได้จากไฟล์ `be_login/db/create-database.sql` แล้วออกจาก MySQL Client ก่อนรัน npm ต่อ

### 2.3 สร้างตารางและบัญชีทดสอบ

รันในโฟลเดอร์ `be_login/`:

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
```

- `db:generate`: สร้าง Prisma Client
- `db:deploy`: นำ Migration ที่มีอยู่ใน Repository ไปใช้กับฐานข้อมูล
- `db:seed`: สร้างหรืออัปเดตบัญชี User/Admin ตาม `DEMO_ACCOUNT_PASSWORD` รันซ้ำแล้วจะตั้งรหัสผ่านของบัญชีตัวอย่างใหม่ตามค่านี้

หากแก้ Prisma Schema ระหว่างพัฒนา ใช้ `npm run db:migrate -- --name describe_change` เพื่อสร้าง Migration ใหม่ บัญชีที่ใช้ Migration ต้องมีสิทธิ์ฐานข้อมูลเพียงพอ และ Seed บัญชีทดลองจะถูกปฏิเสธเมื่อ `NODE_ENV=production`

### 2.4 เริ่ม API

```powershell
npm run dev
```

เปิด [Backend Health](http://localhost:8000/health) ต้องได้ผลลัพธ์:

```json
{ "status": "ok", "database": "connected" }
```

ปล่อย Terminal นี้ทำงาน แล้วเปิด Terminal ใหม่สำหรับ Frontend หาก Health ตอบ `503` ให้ตรวจ MySQL และ `DATABASE_URL`

## 3. ตั้งค่าและเริ่ม Frontend (FE)

เปิด Terminal ใหม่ที่โฟลเดอร์หลัก:

```powershell
cd Login
npm install
npm start
```

เปิด [หน้า Login](http://localhost:4200/login)

Angular ตั้ง `proxyConfig` ไว้แล้วใน `angular.json` และใช้ `Login/proxy.conf.json`:

```json
{
  "/api/**": {
    "target": "http://localhost:8000",
    "secure": false,
    "changeOrigin": true,
    "pathRewrite": { "^/api": "" }
  }
}
```

หากเปลี่ยนพอร์ต Backend ให้แก้ `target` แล้วเริ่ม Frontend ใหม่ ไม่ต้องเปลี่ยน API URL ในแต่ละหน้า ให้เปิด UI ผ่านพอร์ต 4200 เพื่อใช้ Proxy และ Cookie ตามการตั้งค่าปัจจุบัน

## บัญชีทดสอบ — โหมดทดลอง

| Role | Email | รหัสผ่านเริ่มต้น |
| --- | --- | --- |
| User | `user@rich.demo` | `Demo123!` |
| Admin | `admin@rich.demo` | `Demo123!` |

ต้องรัน `npm run db:seed` ก่อนใช้งาน รหัสผ่านจริงขึ้นอยู่กับ `DEMO_ACCOUNT_PASSWORD` ตอน Seed บัญชีเหล่านี้ใช้สำหรับ Local/Demo

## วิธีทดสอบการทำงาน

1. เปิด MySQL, Backend และ Frontend ให้ครบ
2. Login ด้วย User ตรวจว่าเปิด User Dashboard และแสดงข้อมูลผู้ใช้
3. Logout แล้ว Login ด้วย Admin ตรวจว่าเปิด Admin Dashboard
4. ใช้ User เรียก `GET /api/admin/sessions` ผ่าน Frontend origin โดยส่ง Cookie ต้องได้ `403`
5. รีโหลดหน้าและตรวจว่าคืนสถานะจาก Cookie ผ่าน `/auth/me` ได้
6. Logout แล้วตรวจว่า `/api/auth/me` ใช้ Session เดิมไม่ได้และตอบ `401`
7. ลองรหัสผ่านผิด ตรวจข้อความ Error และ Loading ที่สิ้นสุด

สำหรับทดสอบหมดอายุอย่างรวดเร็ว แก้ `.env` แล้วเริ่ม Backend ใหม่:

```dotenv
SESSION_TTL_SECONDS=60
REMEMBER_ME_TTL_SECONDS=300
```

Login ใหม่หลังเปลี่ยนค่า: ไม่เลือก Remember Me จะหมดอายุใน 60 วินาที ส่วนเลือกจะหมดอายุใน 5 นาที ปัจจุบันทั้งสองกรณีต้อง Login ใหม่เมื่อหมดอายุ ยังไม่มี Refresh Token ต่ออายุให้อัตโนมัติ

นำเข้า `be_login/postman/be_login.postman_collection.json` ใน Postman เพื่อทดสอบ API ได้ Postman จะเก็บและส่ง Cookie หลัง Login

## API ปัจจุบัน

| Method | Path ฝั่ง Backend | หน้าที่ |
| --- | --- | --- |
| GET | `/health` | ตรวจ API และฐานข้อมูล |
| POST | `/auth/register` | สมัครสมาชิกซึ่งเป็น API เดิม ไม่จำเป็นต่อ Demo |
| POST | `/auth/login` | เข้าสู่ระบบด้วย `{ email, password, rememberMe }` |
| GET | `/auth/me` | ข้อมูลผู้ใช้ วันหมดอายุ และ Remember Me |
| POST | `/auth/logout` | เพิกถอน Session และล้าง Cookie |
| GET | `/admin/sessions` | รายการ Session เฉพาะ Admin |

Browser เรียก Path เหล่านี้โดยเติม `/api` ด้านหน้า Backend ตรวจสิทธิ์จริงทุกครั้ง ไม่เชื่อถือ Role ที่ส่งมาจาก Frontend

## คำสั่งตรวจสอบและ Build

Frontend — รันใน `Login/`:

```powershell
npm run build
npm test -- --watch=false
```

Backend — รันใน `be_login/`:

```powershell
npm run typecheck
npm run build
npm start
```

`npm start` ของ Backend รันไฟล์ `dist/server.js` ที่ Build แล้ว ใช้แทน `npm run dev` และต้องไม่เปิดสองคำสั่งบนพอร์ตเดียวกันพร้อมกัน

Integration Test ของ Backend ต้องมี MySQL, Migration และบัญชี Demo ที่ Seed แล้ว:

```powershell
node --experimental-strip-types tests/auth.integration.mjs
```

คำสั่งในหัวข้อนี้เป็นวิธีตรวจสอบ ไม่ใช่รายงานว่าการทดสอบผ่านแล้ว Development Proxy ของ Angular ใช้ตอน `npm start` เท่านั้น เมื่อนำ FE ที่ Build แล้วไปให้บริการ ต้องตั้ง Web Server ให้ส่ง `/api` ไป Backend และรองรับ Angular Route Fallback

## โครงสร้างไฟล์หลัก

```text
rich_testing/
├── README.md
├── Doc.txt
├── SYSTEM_DESIGN_PLAN.md
├── Login/
│   ├── proxy.conf.json
│   └── src/app/
│       ├── core/auth/         # Auth Service, Gateway และ Guards
│       └── page/              # Login, Dashboard, Forbidden
└── be_login/
    ├── .env.example
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── db/                    # SQL สร้างฐานข้อมูล
    ├── postman/               # Collection ทดสอบ API
    ├── tests/
    └── src/
        ├── config/
        ├── features/auth/
        ├── features/admin/
        ├── middleware/
        ├── scripts/           # Seed บัญชี Demo
        └── utils/
```

## การแก้ปัญหาเบื้องต้น

| อาการ | สิ่งที่ควรตรวจ |
| --- | --- |
| เชื่อมต่อ Backend ไม่ได้ / Proxy Error | เปิด BE และตรวจ `target` ใน Proxy ให้ตรงกับ `PORT` |
| Health ตอบ 503 / Prisma เชื่อมต่อไม่ได้ | MySQL เปิดอยู่ ชื่อฐานข้อมูล ผู้ใช้ รหัสผ่าน และพอร์ตถูกต้อง |
| Prisma Client ยังไม่พร้อม | รัน `npm run db:generate` |
| ไม่พบตาราง | รัน `npm run db:deploy` |
| Login บัญชี Demo ไม่ผ่าน | ตรวจ `DEMO_ACCOUNT_PASSWORD` แล้วรัน `npm run db:seed` ใหม่ |
| Missing Environment / JWT Secret สั้นเกินไป | สร้าง `.env` ใน `be_login/` และตั้ง Secret อย่างน้อย 32 bytes |
| Origin not allowed | ตรวจ Origin ใน Browser และ `FRONTEND_ORIGINS` แล้วเริ่ม BE ใหม่ |
| Login แล้ว Cookie ไม่ถูกส่ง | Local HTTP ใช้ `COOKIE_SECURE=false` และเปิด FE ผ่าน Proxy |
| พอร์ตถูกใช้งานอยู่ | หยุด Process เดิม หรือเปลี่ยนพอร์ตพร้อมแก้ Proxy/Origin ให้ตรงกัน |

## งานต่อจากระบบปัจจุบัน

แผนเดิมระบุ PostgreSQL แต่โค้ดปัจจุบันใช้ MySQL + Prisma ให้ใช้ขั้นตอน MySQL ใน README นี้สำหรับการรันจริง

ส่วนที่ยังต้องพัฒนาเพื่อให้ครบ Token Strategy ในแผนคือ Access Token อายุสั้นใน memory, Refresh Cookie แยกต่างหาก, `/auth/refresh`, Token Rotation และการตรวจการใช้ Token เก่าซ้ำ รวมถึงการประสาน Refresh ระหว่างหลายแท็บ

อ่านรายละเอียดเพิ่มเติมใน [Backend README](be_login/README.md), [Frontend README](Login/README.md) และ [แผนออกแบบระบบ](SYSTEM_DESIGN_PLAN.md)

## สรุปรายการส่งมอบตาม Doc — Deliverables

### 1. Source Code ของ Angular และ Express

- Frontend: `Login/` ประกอบด้วย Login, Dashboard, Forbidden, Auth Service และ Route Guards
- Backend: `be_login/` ประกอบด้วย Authentication API, Admin API, Middleware, Prisma Schema, Migration และ Seed
- ฐานข้อมูลที่ใช้จริงคือ MySQL ผ่าน Prisma ซึ่งเป็นตัวเลือกฐานข้อมูลของโครงการ
- การมี Source ในเครื่องไม่ได้หมายความว่าถูก Push ขึ้น GitHub ครบแล้ว ต้องตรวจว่ามีทั้งสองโฟลเดอร์ใน Repository ก่อนส่งงาน

### 2. README วิธีติดตั้งและรันระบบ

ขั้นตอนโดยละเอียดอยู่ในหัวข้อ “ตั้งค่าและเริ่ม Backend (BE)” และ “ตั้งค่าและเริ่ม Frontend (FE)” ด้านบน ลำดับเริ่มใช้งานคือ:

1. เปิด MySQL และสร้างฐานข้อมูล `be_login`
2. ติดตั้ง Dependencies ใน `be_login/` และตั้ง `.env`
3. รัน `npm run db:generate`, `npm run db:deploy` และ `npm run db:seed`
4. เปิด BE ด้วย `npm run dev` และตรวจ `http://localhost:8000/health`
5. เปิดอีก Terminal ติดตั้ง Dependencies ใน `Login/` แล้วรัน `npm start`
6. เปิด `http://localhost:4200/login`

### 3. บัญชีทดสอบ Admin และ User

| Role | Email | Password เมื่อใช้ค่า Demo เริ่มต้น |
| --- | --- | --- |
| User | `user@rich.demo` | `Demo123!` |
| Admin | `admin@rich.demo` | `Demo123!` |

สร้างบัญชีด้วย `npm run db:seed` ใน `be_login/` โดยตั้ง `DEMO_ACCOUNT_PASSWORD=Demo123!` ก่อนรัน หากตั้งค่าอื่น รหัสผ่านทั้งสองบัญชีจะเปลี่ยนตามค่า Seed นั้น

### 4. สรุป Token Strategy ที่ใช้อยู่

ใช้ **JWT ใน HttpOnly Cookie ร่วมกับ Session ในฐานข้อมูล** เพื่อให้ Logout เพิกถอนสิทธิ์ได้ทันทีโดยไม่ต้องรอ JWT หมดอายุ

| รายการ | พฤติกรรมปัจจุบัน |
| --- | --- |
| JWT | ลงนาม HS256 และตรวจ issuer, audience, expiry |
| ข้อมูลระบุผู้ใช้ | `sub` เป็น User ID และ `sid` เป็น Session ID |
| ที่เก็บ Token ฝั่ง Browser | Cookie `access_token` แบบ HttpOnly, SameSite=Lax, Path `/` |
| ไม่ Remember Me | JWT/Session 8 ชั่วโมง ตาม `SESSION_TTL_SECONDS`; Cookie ไม่ตั้ง Max-Age |
| Remember Me | JWT/Session 30 วัน ตาม `REMEMBER_ME_TTL_SECONDS`; Cookie มี Max-Age ตาม TTL |
| การตรวจสิทธิ์ | ตรวจ JWT และ Session ที่ยังไม่หมดอายุ/ถูกเพิกถอน พร้อมอ่าน Role จากฐานข้อมูล |
| Logout | ตั้ง `revokedAt` ของ Session และล้าง Cookie |
| รหัสผ่าน | เก็บ Argon2id Hash ไม่เก็บ Plain Text |
| Token หมดอายุ | ตอบ `401` และ Frontend กลับ Login |
| Refresh Token | ยังไม่มี Endpoint หรือการหมุน Token ที่ใช้งานจริง |

เหตุผลของแนวทางปัจจุบันคือรวมการตรวจ JWT กับการควบคุม Session ฝั่ง Server และให้ Browser ส่ง Cookie โดย JavaScript ไม่ต้องอ่าน Token อย่างไรก็ตาม **ยังไม่ครบข้อกำหนด Part B เรื่องการต่ออายุ Access Token สำหรับ Remember Me** การเรียก `/auth/me` เป็นการตรวจ Session เดิม ไม่ได้ต่ออายุ Token

### 5. วิธีทดสอบ Remember Me ทั้งสองกรณี

ก่อนทดสอบ ตั้งค่า Demo ใน `be_login/.env` แล้วเริ่ม Backend ใหม่:

```dotenv
SESSION_TTL_SECONDS=60
REMEMBER_ME_TTL_SECONDS=300
COOKIE_SECURE=false
```

ต้อง Login ใหม่เพื่อให้ Session ใช้ค่า TTL ใหม่ ทดสอบแยกกรณีโดย Logout ก่อนสลับบัญชีหรือเปลี่ยนตัวเลือก

**กรณีไม่เลือก Remember Me**

1. Login โดยไม่เลือก Checkbox
2. ตรวจ Cookie `access_token` ใน Browser DevTools ว่าเป็น Session Cookie ไม่มีวันหมดอายุแบบถาวร
3. รีโหลดก่อนครบ 60 วินาที ต้องคืนสถานะได้ถ้า Cookie ยังอยู่
4. รอเกิน 60 วินาที ต้องกลับ Login; เรียก `/api/auth/me` ด้วย Cookie เดิมต้องได้ `401`
5. ต้องไม่มีการออก Token ใหม่อัตโนมัติ
6. Login อีกครั้งแล้ว Logout ก่อนหมดอายุ จากนั้นทดสอบด้วย Token เดิมต้องได้ `401`

**กรณีเลือก Remember Me**

1. Login โดยเลือก Checkbox
2. ตรวจ Cookie ว่ามีวันหมดอายุตาม TTL ประมาณ 5 นาที
3. รีโหลด หรือปิดแล้วเปิด Browser ปกติอีกครั้งก่อนครบ 5 นาที ต้องคืนสถานะได้เมื่อ Browser เก็บ Cookie ไว้
4. ตรวจว่าข้าม 60 วินาทีแล้วยังใช้งานได้ เพราะ Session นี้มี TTL 300 วินาที ไม่ใช่เพราะ Refresh สำเร็จ
5. รอเกิน 5 นาที ต้องกลับ Login และ `/api/auth/me` ต้องได้ `401`
6. Logout ก่อนหมดอายุแล้วตรวจว่า Session เดิมใช้ต่อไม่ได้

**เกณฑ์ตาม Doc ที่ยังต้องเพิ่ม:** ใช้ Access Token อายุสั้นแยกจาก Refresh Session แล้วตรวจว่า เมื่อ Access Token หมดอายุ กรณี Remember Me สามารถ Refresh และใช้ต่อได้ ขณะที่กรณีไม่เลือกต้อง Login ใหม่ หาก Refresh หมดอายุ ถูกเพิกถอน หรือไม่ถูกต้อง ต้องหยุด Refresh และกลับ Login โดยไม่วนซ้ำ

ขั้นตอนนี้เป็นคู่มือทดสอบ ยังไม่ใช่ผลทดสอบที่ยืนยันว่าผ่านทุกข้อ

### 6. สิ่งที่ทำเสร็จ งานที่ยังไม่เสร็จ และข้อจำกัด

**มีการพัฒนาใน Source Code แล้ว**

- หน้า Login, Dashboard ตาม Role, Forbidden และ Route Guards
- การเชื่อม Angular กับ API ผ่าน Development Proxy
- Login, การคืนสถานะผ่าน `/auth/me` และ Logout
- JWT Cookie ร่วมกับ Session ที่เพิกถอนได้ในฐานข้อมูล
- ตรวจ Authentication/Role ฝั่ง Backend และ Hash รหัสผ่านด้วย Argon2id
- Remember Me แบบเปลี่ยนอายุ JWT/Session และการคงอยู่ของ Cookie
- Prisma Schema/Migration, Seed บัญชี Admin/User และคู่มือติดตั้ง

**ยังไม่เสร็จตามแผน/ข้อกำหนดทั้งหมด**

- Access Token อายุสั้นที่แยกจาก Refresh Session
- Refresh Endpoint, Token Rotation และการตรวจ Token เก่าถูกใช้ซ้ำ
- การต่ออายุอัตโนมัติสำหรับ Remember Me ตาม Part B
- การประสานคำขอ Refresh ระหว่างหลายแท็บ
- การยืนยันผลตรวจรับทุกกรณีและบันทึกผลทดสอบจริงก่อนส่งมอบ

**ข้อจำกัดปัจจุบัน**

- Remember Me ใช้ JWT อายุยาว เมื่อหมดอายุต้อง Login ใหม่ ทั้งสองกรณียังไม่มี Token Renewal
- ตาราง `refresh_tokens` ที่มีใน Schema ไม่ได้แปลว่ามี Refresh Flow ทำงานแล้ว
- การรีโหลดขณะไม่ Remember Me ยังคืนสถานะจาก Session Cookie ได้ ต่างจากแผนที่เสนอให้เก็บ Access Token ใน memory
- ไม่รับประกันว่า Browser จะล้าง Session Cookie ทุกครั้งที่ปิด เพราะอาจเปิดใช้การกู้คืน Session
- Demo Account ใช้รหัสผ่านร่วมกันและเหมาะกับการทดสอบในเครื่อง
- Development Proxy ไม่ได้ติดไปกับไฟล์ FE ที่ Build ต้องตั้ง Reverse Proxy และ HTTPS เมื่อนำไปให้บริการจริง

สถานะ “มีการพัฒนาแล้ว” สรุปจาก Source Code ไม่ใช่การรับรองผลทดสอบครบทุกข้อ ต้องปิดช่องว่าง Refresh Flow และตรวจรับตาม Doc ก่อนระบุว่าส่งมอบครบทั้งหมด
