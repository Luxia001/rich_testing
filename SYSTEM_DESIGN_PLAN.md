# แผนวิเคราะห์และออกแบบระบบ Authentication & Role-Based Access

อ้างอิง: Doc.txt
ขอบเขต: แผนพัฒนาระบบภายใน 1 วัน โดยใช้ Angular + Express + TypeScript + PostgreSQL ที่มีอยู่
สถานะ: เอกสารออกแบบ ยังไม่ได้แก้ไขโค้ดตามแผนนี้

## 1. เป้าหมายและขอบเขต

ให้ผู้ใช้เข้าสู่ระบบด้วยบัญชีตัวอย่าง แสดงชื่อและบทบาท เข้าถึง Dashboard ตามสิทธิ์ และออกจากระบบโดยเพิกถอน Session ได้ทันที

บทบาท:
- Guest: เปิดหน้า Login และส่งคำขอเข้าสู่ระบบ
- User: ดูข้อมูลตนเองและ User Dashboard
- Admin: ดูข้อมูลตนเองและ Admin Dashboard รวมถึง API สำหรับ Admin

งานจำเป็น: Login, Remember Me, Refresh, Logout, Restore Session, Role Guard, Backend Authorization, Loading/Error State และคู่มือทดสอบ
อยู่นอกขอบเขต: สมัครสมาชิก ลืมรหัสผ่าน MFA ระบบจัดการผู้ใช้ และ Dashboard ที่มีข้อมูลจริงซับซ้อน

## 2. วิเคราะห์ช่องว่างจากโค้ดปัจจุบัน

มีแล้ว:
- Backend แยก routes/controller/service และ middleware
- PostgreSQL มี users และ sessions
- Hash รหัสผ่านด้วย Argon2id
- JWT พร้อมตรวจ Session ในฐานข้อมูล และ revoke เมื่อ Logout
- Role middleware, API /auth/me และ /admin/sessions
- โครง Angular และหน้า Login

ต้องพัฒนาต่อ:
- ปัจจุบัน Remember Me เปลี่ยนอายุ JWT/Session แต่ยังไม่มี Refresh Token และ API Refresh จึงยังไม่ครบวงจรตามโจทย์
- เพิ่มชื่อผู้ใช้และบัญชีตัวอย่าง Admin/User
- เพิ่ม Refresh Token Rotation และการตรวจการใช้ Token เก่าซ้ำ
- เชื่อมฟอร์ม Login, Auth Service, HTTP Interceptor และ Route Guards
- เพิ่ม Dashboard และเส้นทาง Angular ซึ่งปัจจุบัน routes ยังว่าง
- เลือกใช้งาน same-origin ผ่าน proxy และเพิ่มการตรวจ Origin สำหรับคำขอเปลี่ยนแปลงข้อมูล
- ตรวจคำสั่ง start: package.json อ้าง dist/index.js แต่ main ระบุ dist/server.js ให้ตรงผล build ก่อนส่งงาน
- API register ที่มีอยู่ไม่จำเป็นต่อโจทย์ ไม่ต้องสร้าง UI สมัครสมาชิก

## 3. สถาปัตยกรรมที่เสนอ

Browser / Angular
  -> /api ผ่าน Angular development proxy หรือ reverse proxy ใน production
  -> Express routes -> validation -> auth/role middleware -> controller -> service
  -> PostgreSQL

เลือก PostgreSQL ต่อจากโครงเดิมเพื่อลดงานย้ายฐานข้อมูล
ใช้ Access JWT อายุสั้น และ opaque Refresh Token ที่สุ่มอย่างปลอดภัย
เหตุผล: แยกอายุสิทธิ์เรียก API ออกจากอายุการกลับมาใช้งาน และเพิกถอน Session ผ่านฐานข้อมูลได้
ทุก protected request ต้องตรวจ Session และ role ปัจจุบันจากฐานข้อมูล ไม่ตัดสินสิทธิ์จากข้อมูลใน Frontend

## 4. นโยบาย Token และ Session

ค่าที่เสนอสำหรับใช้งานปกติ:
- Access Token: 15 นาทีทั้งสองกรณี
- ไม่เลือก Remember Me: Session สิ้นสุดพร้อม Access Token ไม่มี Refresh Token
- เลือก Remember Me: Refresh Session มีอายุสูงสุด 30 วันนับจาก Login
- Refresh แต่ละครั้งหมุน Refresh Token และออก Access Token ใหม่ โดยไม่ขยายวันสิ้นสุด Session 30 วัน
- Access Token ใหม่ต้องไม่หมดอายุเกินเวลาสิ้นสุด Session
- ค่าสำหรับ Demo: Access 60 วินาที, Refresh Session 5 นาที ตั้งผ่าน environment

การจัดเก็บ:
- Access Token: Angular memory ส่งเป็น Authorization: Bearer ไม่เก็บใน localStorage/sessionStorage
- Refresh Token: HttpOnly cookie, Secure เมื่อใช้ HTTPS, SameSite=Lax, Path=/api/auth
- ตั้ง Max-Age ของ Refresh cookie ตามอายุ Session ที่เหลือ เฉพาะ Remember Me
- ฐานข้อมูลเก็บเฉพาะ SHA-256 hash ของ Refresh Token ไม่เก็บค่าจริง
- JWT มี sub, sid, exp, iss, aud และตรวจ algorithm/issuer/audience ตามที่กำหนด
- ไม่จำเป็นต้องใส่ role ใน JWT เพราะ Backend อ่าน role ที่มีผลจริงจากฐานข้อมูล

ผลเมื่อ reload:
- Remember Me: เรียก /auth/refresh หนึ่งครั้งเพื่อคืนสถานะ แล้วโหลดข้อมูลผู้ใช้
- ไม่ Remember Me: token ใน memory หาย จึงกลับไป Login แม้ JWT เดิมยังไม่หมดอายุ นี่เป็นนโยบายชั่วคราวที่เลือกเพื่อลดขอบเขตงานและต้องระบุใน README
- ไม่รับประกันการตรวจจับการปิด Browser เพราะแต่ละ Browser อาจคืน session เดิมได้

## 5. แบบจำลองข้อมูล

users:
- id UUID PK
- email TEXT UNIQUE NOT NULL เก็บรูปแบบ trim/lowercase
- display_name TEXT NOT NULL (เพิ่ม)
- password_hash TEXT NOT NULL
- role: user | admin
- created_at, disabled_at

sessions:
- id UUID PK, user_id FK users
- remember_me BOOLEAN
- created_at, expires_at, revoked_at
- ip_address, user_agent
- expires_at คือขีดจำกัด Session: 15 นาทีหรือ 30 วันตามนโยบาย

refresh_tokens (เพิ่ม):
- id UUID PK, session_id FK sessions
- token_hash TEXT UNIQUE NOT NULL
- created_at, expires_at, used_at
- replaced_by UUID nullable FK refresh_tokens

ความสัมพันธ์: users 1:N sessions และ sessions 1:N refresh_tokens
เพิ่ม index session_id และ expires_at สำหรับค้นหาและล้างข้อมูลหมดอายุ
เก็บ refresh token ที่ใช้แล้วจน Session หมดอายุเพื่อใช้ตรวจ replay
เพิ่ม migration ใหม่ ไม่แก้ migration ที่เคยนำไปใช้แล้ว

## 6. API Contract ที่เสนอ

URL ด้าน Browser ใช้ /api นำหน้า ส่วน Express ใช้ routes เดิมหลัง proxy ตัด prefix

POST /auth/login
- input: { email, password, rememberMe }
- success 200: { user: { id, email, displayName, role }, accessToken, accessExpiresAt, sessionExpiresAt }
- กรณี Remember Me ตั้ง Refresh cookie; กรณีไม่เลือกให้ล้าง cookie เก่าที่อาจค้าง
- หากมี Refresh cookie ของ Session เดิม ให้เพิกถอน Session เดิมก่อนแทน cookie เพื่อไม่ทิ้ง Session ที่ browser นี้ใช้งานต่อไม่ได้
- 400: ข้อมูลไม่ถูกต้อง; 401: Email หรือรหัสผ่านไม่ถูกต้อง; 429: ลองถี่เกินไป

POST /auth/refresh
- รับ Refresh cookie ไม่ต้องใช้ Access Token ที่ยังไม่หมดอายุ
- success 200: ข้อมูลรูปแบบเดียวกับ Login พร้อม Refresh cookie ใหม่
- 401: หมดอายุ/ถูกเพิกถอน/Token ไม่ถูกต้อง พร้อมล้าง cookie
- ไม่ออก Refresh Token ให้ Session ที่ remember_me=false

GET /auth/me
- ต้องใช้ Bearer Access Token และ Session ที่ยังใช้งานได้
- success 200: { user: { id, email, displayName, role } }

POST /auth/logout
- ระบุ Session จาก Access Token ที่ตรวจลายเซ็นได้ หรือ Refresh cookie ที่ถูกต้อง
- รองรับ Logout แม้ Access Token หมดอายุแล้ว โดยใช้ Refresh cookie
- revoke Session และ Token ภายใน Session, clear cookie, success 204
- ทำซ้ำได้โดยไม่เกิดข้อผิดพลาด และห้าม revoke Session จาก sid ที่ไม่ได้ยืนยันความถูกต้อง

GET /admin/sessions
- ตรวจสิทธิ์ Admin จากฐานข้อมูล
- success 200: รายการ Session จำกัดจำนวน พร้อม pagination ถ้าจำเป็น
- ห้ามส่ง hash รหัสผ่าน, Refresh hash หรือ Token

รูปแบบ Error มาตรฐาน:
{ error: { code: "ACCESS_EXPIRED", message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" } }
แยก ACCESS_EXPIRED, AUTH_REQUIRED, SESSION_REVOKED, REFRESH_INVALID, FORBIDDEN, VALIDATION_ERROR และ RATE_LIMITED
ใช้ 401 เมื่อยืนยันตัวตนไม่ได้ และ 403 เมื่อยืนยันตัวตนได้แต่สิทธิ์ไม่เพียงพอ

## 7. ขั้นตอนการทำงานหลัก

Login:
1. Angular ตรวจข้อมูลเบื้องต้น แสดง loading และปิดปุ่มส่งซ้ำ
2. Backend validate, ตรวจ password hash และสถานะบัญชี
3. สร้าง Session และสร้าง Refresh Token เฉพาะ Remember Me
4. Angular เก็บ Access Token ใน memory และนำไป Dashboard ตาม role

เรียก API:
1. Interceptor แนบ Access Token เฉพาะ URL ของ API ระบบนี้
2. Backend ตรวจ JWT และ Session รวมถึง disabled_at และ role ปัจจุบัน
3. ตอบข้อมูลหรือ error code ที่ชัดเจน

Refresh อัตโนมัติ:
1. เกิด 401 ACCESS_EXPIRED และเป็น Session ที่ Remember Me
2. ใช้คำขอ Refresh กลางร่วมกัน (single flight) สำหรับ request ที่ล้มพร้อมกัน
3. ฝั่ง DB ใช้ transaction และ row lock ตรวจ token_hash, used_at และ Session
4. Mark Token เก่าว่าใช้แล้ว สร้าง Token ใหม่ และ commit ก่อนส่ง cookie
5. ส่ง request เดิมซ้ำได้สูงสุดหนึ่งครั้ง
6. Refresh ล้มเหลวให้หยุด retry ล้างสถานะ และกลับ Login
7. ห้าม interceptor refresh จากคำขอ login/refresh/logout หรือจาก 403

Replay และหลายแท็บ:
- หาก Refresh Token ที่ used_at มีค่าแล้วถูกใช้ซ้ำ ให้ revoke Session ทั้งชุด
- single flight ป้องกันซ้ำภายในแท็บเดียว สำหรับหลายแท็บให้ประสาน Refresh ด้วย Web Locks และส่งผลผ่าน BroadcastChannel ก่อนเปิดรองรับเต็มรูปแบบ
- ภายในขอบเขต 1 วันรองรับหนึ่งแท็บเป็นหลัก และระบุข้อจำกัดว่าการ Refresh พร้อมกันหลายแท็บอาจทำให้ต้อง Login ใหม่

Logout:
- ขอ Backend revoke ก่อน ล้าง memory และแจ้งแท็บอื่นล้างสถานะถ้ามี
- หากเครือข่ายล้มเหลวให้ล้าง UI แต่แสดงว่า Logout ฝั่ง Server ยังไม่ยืนยัน เปิดให้ลองซ้ำได้
- การซ่อน UI อย่างเดียวไม่ถือว่าเพิกถอน Session สำเร็จ

## 8. การออกแบบ Angular

core/auth/:
- auth.service.ts: login, refresh, logout, restoreSession และ user/token state
- auth.interceptor.ts: แนบ token, single flight refresh และจำกัด retry
- auth.guard.ts: ตรวจผล restore ก่อนเข้า protected route
- role.guard.ts: ตรวจ role เพื่อเลือกเส้นทาง UI

pages/:
- login: Email, Password, Remember Me, ปุ่ม Login, loading/error
- user-dashboard: ชื่อ, role, ข้อความข้อมูลส่วนตัว และ Logout
- admin-dashboard: ชื่อ, role, ข้อความจัดการระบบ และ Logout
- forbidden: แจ้งสิทธิ์ไม่เพียงพอ

Routes:
/login, /user, /admin, /forbidden และ fallback
Frontend guard ช่วยควบคุมการแสดงผล ส่วน Backend เป็นผู้บังคับสิทธิ์จริง
ตอนเริ่มแอปแสดง loading จน restore เสร็จ ป้องกัน Dashboard กระพริบก่อนรู้สถานะ
แยก network error ออกจากรหัสผ่านผิด และเก็บ returnUrl เฉพาะเส้นทางภายในที่อนุญาต

## 9. มาตรการที่ต้องทำก่อนส่ง

- Validate input ฝั่ง Backend และใช้ parameterized SQL
- ตรวจ Origin ที่อนุญาตสำหรับ POST โดยเฉพาะ refresh/logout ซึ่งใช้ cookie; ไม่พึ่ง SameSite อย่างเดียว
- ใช้ same-origin proxy เป็นค่าเริ่มต้น หากแยก origin ต้องตั้ง CORS เฉพาะ origin จริงและ credentials
- Rate limit Login และ Refresh พร้อมข้อความผิดพลาดที่ไม่เผยรายละเอียดบัญชี
- ไม่ log password, Authorization header หรือ cookie
- จำกัด body size และใช้ Cache-Control: no-store กับ response ข้อมูล authentication
- JWT secret ผ่าน environment ไม่ commit ความลับ
- บัญชีตัวอย่างใช้เฉพาะ development เก็บรหัสผ่านเป็น hash ผ่าน seed script
- มีงานล้าง Session/Refresh Token ที่หมดอายุตามระยะเวลาที่กำหนด

## 10. ลำดับพัฒนาภายใน 1 วัน (8 ชั่วโมง)

ชั่วโมง 1: ยืนยัน policy และ API, ตรวจ build/start, เพิ่ม migration และ seed Admin/User
ชั่วโมง 2-3: Login/Refresh/Rotation/Logout, middleware และ error codes
ชั่วโมง 4: Angular Auth Service, Interceptor, Restore และ Guards
ชั่วโมง 5: Login และ Dashboard ทั้งสอง role พร้อม loading/error
ชั่วโมง 6-7: ทดสอบ API และ Browser ตามรายการด้านล่าง แก้กรณีหมดอายุ/เพิกถอน/refresh ซ้ำ
ชั่วโมง 8: ตรวจ build ทั้งสองส่วน เขียน README บัญชีทดสอบ Token strategy และข้อจำกัด

ให้ Token Lifecycle และ Backend Authorization เสร็จก่อนปรับความสวยงาม

## 11. เกณฑ์ทดสอบและรับงาน

1. Admin/User Login ถูกต้อง แสดงชื่อและ Dashboard ตรง role
2. รหัสผ่านผิดแสดงข้อความกลางและปุ่มกลับมาใช้งานได้
3. User เรียก /admin/sessions โดยตรงได้ 403 แม้แก้ role ใน UI
4. Remember Me: รอ Access 60 วินาทีแล้วเรียก API ต้อง Refresh และใช้งานต่อได้
5. Remember Me: reload แล้ว restore ได้ภายใน Refresh Session 5 นาที
6. ไม่ Remember Me: รอ Access หมดอายุต้องกลับ Login โดยไม่มีคำขอ Refresh อัตโนมัติ
7. ไม่ Remember Me: reload แล้วกลับ Login ตาม policy ที่ประกาศ
8. Refresh Token หมดอายุ/ไม่ถูกต้อง/Session ถูก revoke ต้อง Login ใหม่และไม่เกิด refresh loop
9. Logout แล้วใช้ Access Token เดิมเรียก /auth/me ต้องได้ 401 ทันที
10. Logout แล้ว Refresh Token เดิมใช้อีกไม่ได้ รวมถึง Logout เมื่อ Access หมดอายุ
11. Refresh สำเร็จแล้วนำ Token เก่ามาใช้ซ้ำต้อง revoke Session และ Token ใหม่ใช้ต่อไม่ได้
12. หลาย API หมดอายุพร้อมกันในหนึ่งแท็บเกิด Refresh เพียงครั้งเดียว
13. Token ถูกแก้ไขและบัญชีถูก disable ต้องถูกปฏิเสธ
14. Network error ระหว่าง Login/Refresh/Logout ต้องไม่ค้าง loading หรือวน retry
15. ตรวจ cookie flags, response ไม่เผย secret และ request จาก Origin ที่ไม่อนุญาตถูกปฏิเสธ
16. Build Angular, typecheck/build Backend และ npm start จากผล build ได้จริง

ใช้ integration tests กับฐานข้อมูลทดสอบสำหรับ rotation/replay/logout และตรวจ UI flow ผ่าน Browser

## 12. สิ่งที่ต้องส่งมอบ

- Source Angular และ Express
- Migration และ seed script ที่รันซ้ำได้สำหรับบัญชีตัวอย่าง
- .env.example ไม่มีความลับจริง พร้อมค่าปกติและ Demo
- README: ติดตั้งฐานข้อมูล รัน migrate/seed/start และ proxy configuration
- รายละเอียดบัญชีทดสอบ Admin/User และข้อห้ามใช้ production
- ตาราง Token policy และขั้นตอนทดสอบ Remember Me ทั้งสองแบบ
- รายการงานที่เสร็จ ผลทดสอบ งานที่ยังไม่เสร็จ และข้อจำกัดหลายแท็บ/การ reload

การตัดสินใจหลัก: รักษา stack เดิม เพิ่ม Refresh Token แบบหมุนและ Session ที่เพิกถอนได้ โดยไม่เพิ่มฟีเจอร์นอกโจทย์
