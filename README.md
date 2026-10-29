# rich_testing — Authentication & Role-Based Access

ระบบ Login ด้วย Angular + Express + TypeScript ใช้ MySQL ผ่าน Prisma รองรับ User/Admin, Dashboard ตาม Role, Remember Me และ Session ที่เพิกถอนได้

README นี้สรุปจาก Source Code ปัจจุบัน ไม่ใช่การรับรองว่าทดสอบครบทุกกรณี ข้อกำหนดอยู่ใน [Doc.txt](Doc.txt) และแนวทางออกแบบเดิมอยู่ใน [SYSTEM_DESIGN_PLAN.md](SYSTEM_DESIGN_PLAN.md)

## ภาพรวมระบบ

| ส่วน | ตำแหน่ง | หน้าที่ |
| --- | --- | --- |
| Frontend | `Login/` | Angular 20, Login, Dashboard, Guards, Auth Service และ HTTP Interceptor |
| Backend | `be_login/` | Express 5, ตรวจรหัสผ่าน, JWT, Refresh Rotation และตรวจสิทธิ์ |
| Database | MySQL + Prisma | ตาราง users, sessions และ refresh_tokens |

```mermaid
flowchart LR
    U[ผู้ใช้] --> FE[Angular :4200]
    FE -->|/api ผ่าน Proxy| BE[Express :8000]
    BE --> P[Prisma ORM]
    P --> DB[(MySQL :3306)]
```

ตัวอย่าง Frontend เรียก `/api/auth/login` แล้ว Development Proxy ตัด `/api` ส่งไป `http://localhost:8000/auth/login` Backend เป็นผู้ตรวจ Authentication และ Role จริงทุกครั้ง ไม่เชื่อถือสิทธิ์ที่แก้ไขจากหน้าจอ

## Token เก็บที่ไหน

| ข้อมูล | ที่เก็บ | การใช้งาน |
| --- | --- | --- |
| Access Token (JWT) | Memory ของ Angular `AuthService` | Interceptor แนบเป็น `Authorization: Bearer <token>` |
| Refresh Token แบบสุ่ม | HttpOnly Cookie `refresh_token` เฉพาะ Remember Me | Browser ส่งให้ Refresh/Logout ตาม Cookie Path |
| Refresh Token Hash | MySQL ตาราง refresh_tokens | เก็บ SHA-256 Hash เพื่อตรวจ Token โดยไม่เก็บค่าจริง |
| Session | MySQL ตาราง sessions | ตรวจวันหมดอายุ การเพิกถอน เจ้าของ Session และ Remember Me |
| Password | MySQL ตาราง users | เก็บ Argon2id Hash |

**ไม่มีการเก็บ Token ใน localStorage หรือ sessionStorage** JavaScript อ่าน Refresh Cookie ไม่ได้ ส่วน Access Token ใน memory หายเมื่อโหลดหน้าใหม่ แต่สามารถคืนสถานะจากแท็บอื่นหรือ Refresh Cookie ได้ตามเงื่อนไขด้านล่าง

Refresh Cookie ใช้ HttpOnly, SameSite=Lax, Path ตาม `REFRESH_COOKIE_PATH` ซึ่งเริ่มต้นเป็น `/api/auth` และ Secure ตาม `COOKIE_SECURE`

## ลำดับการทำงานปัจจุบัน

### 1. Login

1. Angular รับ Email, Password และ Remember Me พร้อมตรวจ Form แสดง Loading และป้องกันกดส่งซ้ำ
2. Backend ตรวจข้อมูล ตรวจ Argon2id Hash และปฏิเสธบัญชีที่ถูกปิดใช้งาน
3. สร้าง Session และออก Access JWT โดยมี User ID ใน `sub` และ Session ID ใน `sid`
4. กรณี Remember Me สร้าง Refresh Token เก็บ Hash ใน DB และส่งค่าจริงผ่าน Cookie; หากไม่เลือกจะไม่สร้าง Refresh Token และล้าง Refresh Cookie เก่า
5. ส่ง `{ user, accessToken, accessExpiresAt, sessionExpiresAt }` ให้ Angular
6. Angular เก็บข้อมูลใน memory แล้วไป `/user` หรือ `/admin` ตาม Role

หากมี Refresh Token ของ Session ก่อนหน้า Backend จะเพิกถอน Session นั้นหลังยืนยันรหัสผ่านสำเร็จ ก่อนเริ่ม Session ใหม่

### 2. เรียก API และตรวจสิทธิ์

Interceptor แนบ Bearer Token เฉพาะ API `/api/` ของระบบ Backend ตรวจลายเซ็น HS256, issuer, audience และอายุ JWT จากนั้นตรวจ Session ใน DB ว่ายังไม่หมดอายุหรือถูกเพิกถอน พร้อมตรวจสถานะบัญชีและ Role ปัจจุบัน

- ไม่มี Token หรือ Token ไม่ถูกต้อง: `401`
- Access Token หมดอายุ: `401 ACCESS_EXPIRED`
- Session หมดอายุ/ถูกเพิกถอน: `401 SESSION_REVOKED`
- Role ไม่พอ: `403 FORBIDDEN`

Admin เปิด Admin Dashboard และ API รายการ Session ได้ ส่วน User เปิด User Dashboard ได้ การเปลี่ยน Role ฝั่ง FE ไม่ทำให้เข้าถึง API Admin ได้

### 3. Remember Me และการต่ออายุ

| พฤติกรรม | ไม่เลือก Remember Me | เลือก Remember Me |
| --- | --- | --- |
| อายุ Session | เท่ากับ `ACCESS_TTL_SECONDS` | ตาม `REMEMBER_ME_TTL_SECONDS` |
| Access Token | อายุไม่เกิน Session | อายุไม่เกิน Session |
| Refresh Token | ไม่มี | มี พร้อมวันหมดอายุแยก |
| Access หมดอายุ | ล้างสถานะและกลับ Login | ขอ Token ใหม่ได้หาก Refresh Token และ Session ยังใช้ได้ |
| วันสิ้นสุด Session | ไม่ต่ออายุ | Refresh ไม่ขยายขีดจำกัด Session |

เมื่อ API ตอบ `ACCESS_EXPIRED` และเป็น Remember Me Frontend ส่ง `POST /auth/refresh` Backend ตรวจ Refresh Token, Session และบัญชี แล้วสร้าง Token ทดแทนก่อนผูก Foreign Key จาก Token เก่า ทั้งหมดอยู่ใน Transaction

Refresh สำเร็จจะทำเครื่องหมาย Token เก่าว่าใช้แล้ว ส่ง Access Token ใหม่ และแทน Refresh Cookie จากนั้น Interceptor ส่งคำขอ API เดิมซ้ำได้สูงสุดหนึ่งครั้ง หลายคำขอในแท็บเดียวแชร์ Promise ของ Refresh และไม่ Refresh ซ้ำจาก Login/Refresh/Logout หรือจาก `403`

หากนำ Refresh Token ที่ใช้แล้วกลับมาใช้อีก Backend จะเพิกถอน Session นั้น หาก Refresh ผิด/หมดอายุ/ถูกเพิกถอนหรือคำขอต่ออายุล้มเหลว FE ล้างสถานะและกลับ Login โดยไม่วน Refresh ซ้ำอัตโนมัติ

**ไม่มี Timer ต่ออายุ Refresh Token ระหว่างที่ไม่ได้เรียกใช้งาน** Token อาจหมดอายุก่อนผู้ใช้ส่ง API ถัดไป แม้ Session รวมยังเหลือเวลา

### 4. Reload และหลายแท็บ

เมื่อเริ่มแอป Angular แสดง Loading ระหว่างคืนสถานะ:

1. ขอ Session ที่ Access Token ยังไม่หมดอายุจากแท็บอื่นผ่าน BroadcastChannel โดยรอได้ประมาณ 300 ms
2. หากไม่ได้รับ จะเรียก Refresh Endpoint ด้วย HttpOnly Cookie
3. ไม่มี Cookie หรือ Refresh ใช้ไม่ได้จะกลับ Login

ดังนั้นไม่ Remember Me แล้ว reload ในแท็บเดียวโดยไม่มีแท็บอื่นที่ยังถือ Token จะต้อง Login ใหม่ แต่ถ้ามีแท็บอื่นส่ง Session ที่ยังใช้ได้กลับมา อาจคืนสถานะได้แม้ไม่เลือก Remember Me

โค้ดใช้ Web Locks จัดลำดับ Login/Refresh/Logout ข้ามแท็บเมื่อ Browser รองรับ และส่งข้อความ Logout ผ่าน BroadcastChannel ให้แท็บอื่นล้างสถานะ ยังต้องทดสอบ Browser/หลายแท็บจริงก่อนระบุว่าครอบคลุมทุกกรณี

### 5. Logout และ Error Handling

Backend ตรวจ Bearer ที่มีลายเซ็นถูกต้องหรือ Refresh Cookie แล้วเพิกถอน Session และล้าง Cookie รองรับ Logout ด้วย Bearer ที่หมดอายุแล้วโดยยังตรวจลายเซ็นอยู่ และเรียก Logout ซ้ำได้

Frontend ล้าง UI และแจ้งแท็บอื่น หากเครือข่ายล้มเหลวจะเก็บ Bearer ไว้ชั่วคราวใน memory ส่วนตัวสำหรับลอง Logout อีกครั้ง พร้อมแจ้งว่ายังยืนยันการออกจากระบบฝั่ง Server ไม่ได้ เมื่อ Backend revoke สำเร็จ Token เดิมของ Session นั้นจะเรียก Protected API ไม่ได้

หน้า Login แสดงข้อความผิดพลาด/Loading มีสถานะคืน Session ตอนเริ่มแอปและ Loading สำหรับการตรวจ Session จาก Dashboard

## ค่าอายุ Token ปัจจุบัน

ค่าจริงขึ้นอยู่กับ `be_login/.env` ตารางนี้แยกค่า fallback ใน Source ออกจากไฟล์ตัวอย่าง:

| Environment | fallback ใน env.ts | `.env.example` ปัจจุบัน |
| --- | --- | --- |
| `ACCESS_TTL_SECONDS` | 60 วินาที | 60 วินาที |
| `REMEMBER_ME_TTL_SECONDS` | 90 วินาที | 90 วินาที |
| `REFRESH_TOKEN_TTL_SECONDS` | 20 วินาที | 20 วินาที |

Refresh Token ใหม่มีอายุไม่เกินเวลาที่เหลือของ Session และต่อช่วงอายุของตัวมันเองทุกครั้งที่หมุนสำเร็จ แต่ไม่ขยายวันสิ้นสุด Session ส่วน `SESSION_TTL_SECONDS` จากเอกสารรุ่นเก่าไม่มีผลใน env.ts ปัจจุบันแล้ว

**ข้อจำกัดของค่าตัวอย่าง:** Refresh Token อายุ 20 วินาทีสั้นกว่า Access Token 60 วินาที หาก Login แล้วรอจน Access หมดอายุโดยไม่มี Refresh ก่อนหน้านั้น จะต่ออายุไม่ได้และกลับ Login ค่านี้ใช้สาธิต Refresh หมดอายุได้ แต่ไม่เหมาะกับการสาธิตการต่ออายุอัตโนมัติสำเร็จ

## ติดตั้งและเริ่ม Backend (BE)

เตรียม Node.js ที่รองรับ Angular 20 และการรัน TypeScript ผ่าน `--experimental-strip-types` เช่น Node.js 22.12+ ในสาย 22 หรือ Node.js 24 พร้อม npm และ MySQL ที่เปิดใช้งาน

เปิด Terminal ที่โฟลเดอร์หลัก:

```powershell
cd be_login
npm install
Copy-Item .env.example .env
```

คัดลอกไฟล์เฉพาะครั้งแรก หากมี `.env` แล้วให้แก้ไฟล์เดิม ตัวอย่าง Local สำหรับทดสอบ Refresh สำเร็จ:

```dotenv
PORT=8000
DATABASE_URL="mysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/be_login"
JWT_SECRET=REPLACE_WITH_YOUR_GENERATED_SECRET
ACCESS_TTL_SECONDS=60
REMEMBER_ME_TTL_SECONDS=300
REFRESH_TOKEN_TTL_SECONDS=180
COOKIE_SECURE=false
REFRESH_COOKIE_PATH=/api/auth
DEMO_ACCOUNT_PASSWORD=Demo123!
FRONTEND_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
```

แก้ MySQL credentials ให้ตรงเครื่อง URL-encode รหัสผ่านที่มีอักขระพิเศษ และสร้าง JWT Secret แล้วนำผลลัพธ์ไปใส่ใน `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

JWT Secret ต้องมีอย่างน้อย 32 bytes เก็บ `.env` ไว้ในเครื่อง สำหรับ Local HTTP ใช้ `COOKIE_SECURE=false`; เมื่อให้บริการ HTTPS ใช้ `true`

สร้าง Database ผ่าน MySQL Client หรือ Workbench:

```sql
CREATE DATABASE IF NOT EXISTS be_login
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

จากนั้นรันใน `be_login/`:

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Seed จะสร้างหรืออัปเดตบัญชี Demo ตาม `DEMO_ACCOUNT_PASSWORD` และถูกปฏิเสธเมื่อ `NODE_ENV=production` ใช้ `db:deploy` เพื่อนำ Migration ที่มีอยู่ไปใช้ ส่วนการแก้ Schema ระหว่างพัฒนาใช้ `npm run db:migrate -- --name describe_change`

ตรวจ [Backend Health](http://localhost:8000/health) ควรตอบ `{ "status": "ok", "database": "connected" }` แล้วปล่อย Terminal นี้ทำงาน

## ติดตั้งและเริ่ม Frontend (FE)

เปิด Terminal อีกอันที่โฟลเดอร์หลัก:

```powershell
cd Login
npm install
npm start
```

เปิด [หน้า Login](http://localhost:4200/login) Angular ใช้ `Login/proxy.conf.json` ส่ง `/api/**` ไป `http://localhost:8000` พร้อมตัด `/api` หากเปลี่ยนพอร์ต BE ให้แก้ Proxy และเริ่ม FE ใหม่

## บัญชีทดสอบ

| Role | Email | Password เมื่อ Seed ด้วยค่าตัวอย่าง |
| --- | --- | --- |
| User | `user@rich.demo` | `Demo123!` |
| Admin | `admin@rich.demo` | `Demo123!` |

ทั้งสองบัญชีใช้รหัสผ่านตาม `DEMO_ACCOUNT_PASSWORD` ที่ตั้งไว้ขณะรัน `npm run db:seed` เหมาะกับ Local/Demo

## วิธีทดสอบ Remember Me

เพื่อทดสอบต่ออายุสำเร็จ ใช้ค่า `ACCESS_TTL_SECONDS=60`, `REMEMBER_ME_TTL_SECONDS=300`, `REFRESH_TOKEN_TTL_SECONDS=180` ตามตัวอย่างด้านบน เริ่ม BE ใหม่และ Login ใหม่หลังแก้ค่า

### ไม่เลือก Remember Me

1. Login โดยไม่เลือก Checkbox และตรวจว่ามี Access Token ใน Login Response แต่ไม่มี Refresh Token สำหรับ Session นี้
2. รอเกิน 60 วินาที ต้องกลับ Login โดยไม่มีการ Refresh อัตโนมัติสำหรับ Session ที่ไม่ Remember Me
3. ทดสอบ reload โดยปิดแท็บอื่นของระบบก่อน ต้อง Login ใหม่ เนื่องจาก Access Token ใน memory หายและไม่มี Refresh Cookie
4. Login ใหม่แล้ว Logout ก่อนหมดอายุ นำ Bearer เดิมเรียก `/api/auth/me` ต้องได้ `401`

### เลือก Remember Me

1. Login โดยเลือก Checkbox ตรวจ Refresh Cookie แบบ HttpOnly และ Bearer ในคำขอ Protected API
2. รอประมาณ 65 วินาที แล้วกดตรวจสอบ Session หรือเรียก Protected API ต้องได้ Access Token ใหม่และใช้งานต่อได้
3. ตรวจ Network ว่ามี `/api/auth/refresh` และ Cookie ถูกแทนด้วย Token ใหม่ แต่วันสิ้นสุด Session เดิมไม่เปลี่ยน
4. Reload ก่อน Refresh Token หมดอายุ ต้องคืนสถานะได้จาก Refresh Cookie หรือแท็บอื่น
5. รอจน Session รวม 300 วินาทีหมดอายุ ต้องกลับ Login
6. Login ใหม่แล้ว Logout ตรวจว่า Access/Refresh Token เดิมใช้ต่อไม่ได้

แยกทดสอบ Refresh หมดอายุโดยตั้ง `REFRESH_TOKEN_TTL_SECONDS=20` แล้ว Login ใหม่ รอจน Access หมดอายุและเรียก API ต้องกลับ Login โดยไม่ Refresh วน ตรวจใน DevTools ได้ว่าไม่มี Token ใน Local Storage/Session Storage

## API ปัจจุบัน

Path ต่อไปนี้เป็นของ BE โดย Browser ผ่าน Proxy ต้องเติม `/api` นำหน้า:

| Method | Path | การยืนยันตัวตน/หน้าที่ |
| --- | --- | --- |
| GET | `/health` | ตรวจ API และ DB |
| POST | `/auth/login` | `{ email, password, rememberMe }` |
| POST | `/auth/refresh` | Refresh Cookie; ออก Token ใหม่ |
| GET | `/auth/me` | Bearer; ส่ง `{ user }` |
| POST | `/auth/logout` | Bearer และ/หรือ Refresh Cookie; revoke Session |
| GET | `/admin/sessions` | Bearer + Role Admin |
| POST | `/auth/register` | API สมัครสมาชิกเดิม ไม่จำเป็นต่อ Demo |

หากใช้ Postman กับ BE โดยตรง ให้แนบ Bearer สำหรับ Protected API และตรวจ Cookie Path ด้วย ค่าเริ่มต้น `/api/auth` ออกแบบสำหรับ Browser ผ่าน FE Proxy; Cookie Jar อาจไม่ส่ง Cookie เมื่อเรียกตรง `/auth/refresh` ต้องตั้ง `REFRESH_COOKIE_PATH=/auth` ให้ตรงวิธีทดสอบ หรือส่ง Cookie header เอง

## คำสั่ง Build และตรวจสอบ

FE — รันใน `Login/`:

```powershell
npm run build
npm test -- --watch=false
```

BE — รันใน `be_login/`:

```powershell
npm run typecheck
npm run build
npm start
```

BE `npm start` ใช้ผล Build `dist/server.js` แทนโหมด dev อย่าเปิดสอง Process บนพอร์ตเดียวกัน ส่วน FE หลัง Build ต้องตั้ง Web Server ให้รองรับ Angular Route Fallback และ Reverse Proxy `/api`; Development Proxy ไม่ติดไปกับไฟล์ Build

Integration Test (ต้องมี MySQL และ Seed):

```powershell
node --experimental-strip-types tests/auth.integration.mjs
```

Test ปัจจุบันยังมี assertion `expiresAt` และ `rememberMe` ที่ไม่ตรง Response ใหม่ จึงต้องปรับก่อนใช้เป็นหลักฐานตรวจรับครบทุกข้อ ในรอบจัดทำ README นี้ตรวจ Source และคำสั่งตั้งค่า ไม่ได้รันชุดทดสอบใหม่

## สถานะส่งมอบตาม Doc.txt

| Deliverable | สถานะปัจจุบัน |
| --- | --- |
| 1. Source Angular และ Express | มีใน `Login/` และ `be_login/` |
| 2. วิธีติดตั้งและรัน | อยู่ในหัวข้อ BE/FE ด้านบน |
| 3. บัญชีทดสอบ Admin/User | มี Seed และข้อมูลบัญชีใน README |
| 4. Token Strategy | Access ใน memory, Refresh Cookie, Hash/Session ใน DB และ TTL ตามตาราง |
| 5. วิธีทดสอบ Remember Me ทั้งสองกรณี | มีขั้นตอนและค่าทดลอง แยกกรณี Refresh สำเร็จ/หมดอายุ |
| 6. งานเสร็จ/ค้าง/ข้อจำกัด | สรุปด้านล่าง โดยไม่ได้รับรองว่าผ่าน End-to-End แล้ว |


### งานค้างและข้อจำกัด

- ต้องปรับ Integration Test ให้ตรง API Contract แล้วตรวจ Lifecycle, Rotation/replay, Token หมดอายุ และ Role แบบครบวงจร
- Login/Register/Refresh ยังใช้ limiter ร่วมกัน 10 ครั้ง/15 นาทีต่อ IP การ Restore หรือหลายผู้ใช้ IP เดียวกันอาจถูก 429 และต้อง Login ใหม่
- ค่าตัวอย่าง Refresh 20 วินาทีสั้นกว่า Access 60 วินาที จึงต้องปรับเพื่อทดสอบต่ออายุสำเร็จ หรือใช้เพื่อทดสอบหมดอายุโดยตั้งใจ
- การทำงานหลายแท็บขึ้นกับ Browser API และยังต้องทดสอบ Concurrency จริง โดย Session ที่ไม่ Remember Me ก็แชร์จากแท็บอื่นได้

[review.md](review.md) เป็นผลตรวจ ณ เวลาที่จัดทำ บางรายการมีการแก้ Source ภายหลังแล้ว เช่น ลำดับ Foreign Key จึงต้องอ่านเทียบสถานะล่าสุดใน README และทดสอบซ้ำก่อนปิดรายการ


อ่านรายละเอียดส่วนย่อยใน [Backend README](be_login/README.md) และ [Frontend README](Login/README.md) หากรายละเอียด Token รุ่นเก่าขัดกับ Source ให้ยึดโค้ดและสรุปปัจจุบันในเอกสารนี้
