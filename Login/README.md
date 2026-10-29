# Rich — Login เชื่อม Backend

Frontend ใช้ Angular Reactive Forms และ HttpClient ติดต่อ Express ที่ http://localhost:8000 ผ่าน same-origin development proxy ไม่ใช้ Mock เป็นค่าเริ่มต้น

## รันระบบ

1. ใน be_login ตั้งค่า MySQL/DATABASE_URL และ JWT_SECRET ตาม README ของ Backend
2. รัน npm install และ npm run db:generate ตามการติดตั้งเดิม หากต้องใช้บัญชี demo ให้ตั้ง DEMO_ACCOUNT_PASSWORD แล้วรัน npm run db:seed ตามคู่มือ Backend
3. เปิด Backend ด้วย npm run dev (port 8000)
4. ใน Login รัน npm install และ npm start แล้วเปิด http://localhost:4200
5. ถ้าเปิด Angular dev server ค้างก่อนเพิ่ม proxy ให้หยุดแล้วรัน npm start ใหม่

ตัวอย่างบัญชีที่ seed ของ Backend รองรับ: user@rich.demo และ admin@rich.demo ใช้รหัสผ่านจาก DEMO_ACCOUNT_PASSWORD ของเครื่องนั้น บัญชี Frontend ไม่ถูกสร้างอัตโนมัติ

## API flow

- POST /api/auth/login -> http://localhost:8000/auth/login ส่ง {email,password,rememberMe}
- Backend ส่ง HttpOnly cookie และ {user,expiresAt,rememberMe}
- GET /api/auth/me ใช้ cookie คืนสถานะผู้ใช้และวันหมดอายุเมื่อ reload และตรวจ Session ก่อนเข้า protected route
- User ไป /user, Admin ไป /admin; สิทธิ์ข้อมูลจริงตรวจที่ Backend
- GET /api/admin/sessions โหลดรายการ Session จริงสำหรับ Admin
- POST /api/auth/logout revoke Session และล้าง cookie รองรับ cookie หมดอายุ/Logout ซ้ำ
- ไม่มีการเก็บ password/token/user session ใน localStorage ของ Frontend

Remember Me เปิด: Backend ออก persistent cookie ตาม TTL ที่ตั้งไว้
Remember Me ปิด: cookie ไม่ตั้ง Max-Age/Expires จึงเป็น browser-session cookie; reload ยังใช้งานต่อได้หาก Session ยังไม่หมดอายุ Browser บางตัวอาจคืน cookie เมื่อ restore browser session

API ปัจจุบันใช้ Access JWT ใน cookie ยังไม่มี Refresh Token endpoint ปุ่มตรวจสอบ Session เรียก /me และไม่ต่ออายุ JWT อายุ Session แสดงจาก Backend ไม่ใช้เวลา demo 60 วินาที/5 นาที

## ข้อผิดพลาด

แยกข้อความ network/server/validation/credentials/forbidden/rate limit และปิดฟอร์มระหว่าง Login ป้องกันส่งซ้ำ
เมื่อ protected API ตอบ 401 ล้าง UI แล้วกลับ Login; 403 ไปหน้าไม่มีสิทธิ์
เมื่อ Logout ติดต่อ Backend ไม่สำเร็จ ล้าง UI และแสดงปุ่มลองออกจากระบบอีกครั้ง ยังไม่ถือว่า revoke ฝั่ง Server สำเร็จ

## Cookie, proxy และ production

- ใช้ localhost ให้ตรงกันระหว่าง browser/Frontend ระหว่างทดสอบ
- COOKIE_SECURE=false สำหรับ local HTTP; ตั้ง true และ HTTPS สำหรับ production
- FRONTEND_ORIGINS รองรับรายการ origin คั่น comma ค่า local เริ่มต้น http://localhost:4200,http://127.0.0.1:4200
- ไม่จำเป็นต้องเปิด CORS เพราะ browser ติดต่อ /api ที่ origin ของ Frontend และ Angular proxy ส่งต่อ
- เมื่อ deploy ต้องตั้ง reverse proxy ให้ /api/* ไป Backend พร้อมตัด prefix /api; proxy.conf.json ทำงานเฉพาะ Angular dev server

## ตรวจสอบ

Frontend:

```sh
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Backend:

```sh
npm run typecheck
npm run build
node --experimental-strip-types tests/auth.integration.mjs
```

Integration test ใช้ฐานข้อมูลที่ตั้งในเครื่องและบัญชี demo ที่ seed แล้ว สร้าง/revoke Session เพื่อทดสอบ Login, cookie flags/persistence, /me, User ถูกปฏิเสธ Admin API, Admin อ่าน sessions, Logout และการเรียกซ้ำ โดยไม่พิมพ์ password/token

MockAuthGateway และชุดทดสอบเดิมเก็บไว้สำหรับทดสอบแยกส่วน แต่ไม่ได้ถูกใช้โดย provider หลัก

## ผลตรวจสอบการเชื่อมต่อ

- Frontend production build ผ่าน (มี CSS budget warning เดิม)
- Backend typecheck และ build ผ่าน
- Angular ChromeHeadless tests ผ่าน 15/15
- Integration ผ่านทั้ง server ทดสอบและเส้นทาง http://localhost:4200/api -> localhost:8000: health/DB, guest, Origin validation, รหัสผ่านผิด, User/Admin login, cookie persistence, restore metadata, role authorization, revoke หลัง Logout และ Logout ซ้ำ
- ทดสอบผ่าน proxy ซ้ำได้โดยตั้ง AUTH_TEST_BASE_URL=http://localhost:4200/api ก่อนรัน integration script ใน Backend
