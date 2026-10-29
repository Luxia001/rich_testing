# Rich — Angular Authentication

Frontend เชื่อม Backend ผ่าน /api -> http://localhost:8000 ด้วย Angular dev proxy และใช้ contract Access Token + Refresh Token ล่าสุด

## รัน

```sh
npm install
npm start
```

เปิด http://localhost:4200 และเปิด Backend/ฐานข้อมูลตาม README ของ be_login หากเพิ่งเพิ่ม proxy ต้อง restart Angular dev server

ใช้บัญชีในฐานข้อมูล เช่น user@rich.demo / admin@rich.demo ที่ seed แล้ว รหัสผ่านเป็นค่าที่กำหนดใน Backend ไม่ได้ฝังไว้ใน Frontend

## Token lifecycle

- POST /api/auth/login ส่ง {email,password,rememberMe} รับ {user,accessToken,accessExpiresAt,sessionExpiresAt}
- เก็บ Access Token ใน AuthService memory เท่านั้น ไม่เก็บ token/password ใน localStorage หรือ sessionStorage
- Interceptor แนบ Authorization: Bearer เฉพาะ protected URL ที่ขึ้นต้น /api/ ของระบบ
- Remember Me: refresh cookie เป็น HttpOnly ที่ Backend จัดการ; เปิดแอปใหม่คืนสถานะด้วย POST /api/auth/refresh หนึ่งครั้ง
- ไม่ Remember Me: reload ต้อง Login ใหม่; เมื่อ Access หมดอายุไม่ขอ Refresh อัตโนมัติ
- เมื่อ protected API ตอบ 401 ACCESS_EXPIRED และ Remember Me ยังมีอายุ ใช้ single-flight refresh ร่วมกัน แล้ว retry คำขอเดิมสูงสุด 1 ครั้ง
- 403, SESSION_REVOKED และข้อผิดพลาด login/refresh/logout ไม่เริ่ม refresh loop
- Refresh ไม่สำเร็จล้างสถานะ UI และกลับ Login พร้อมข้อความผิดพลาด
- GET /api/auth/me ใช้ Bearer ตรวจผู้ใช้/บทบาทปัจจุบันก่อนเข้า Dashboard
- Logout ส่ง Access Token ก่อนล้างข้อมูล UI จึง revoke Session ที่ไม่ Remember Me ได้ เก็บ Token ใน memory แบบ private เพื่อ retry หากเครือข่ายล้มเหลว
- Refresh ไม่ขยายเวลาสิ้นสุด Session; หน้า Dashboard แสดงอายุ Access และ Session แยกกัน
- ประสาน Session/Logout ข้ามแท็บด้วย BroadcastChannel และจัดคิว Refresh ด้วย Web Locks

## API และ proxy

proxy.conf.json ส่ง /api/* ไป localhost:8000 โดยตัด /api ออก
Refresh cookie ต้องตั้ง Path ที่ตรง Browser คือ /api/auth (Backend ล่าสุดใช้ REFRESH_COOKIE_PATH)
Production ต้องตั้ง reverse proxy เส้นทางเดียวกันและ HTTPS พร้อม Secure cookie

## ทดสอบ

```sh
npm run build
node node_modules/typescript/bin/tsc -p tsconfig.spec.json --noEmit
npm test -- --watch=false --browsers=ChromeHeadless
```

มี tests ของ gateway contract, Bearer scope, ACCESS_EXPIRED retry สูงสุดหนึ่งครั้ง, ไม่ refresh จาก auth actions/403/revoke/non-remembered, single-flight, Logout retry และ expiry

## ผลตรวจรอบปรับ Frontend

- Production build ผ่าน มี warning ขนาด CSS ของ Login เดิม
- ChromeHeadless tests รอบสุดท้ายผ่าน 24/24 รายการ หลังเพิ่ม Session version protection
- API จริงผ่าน Angular proxy: User/Admin Login contract, Bearer /me, authorization และ Logout revoke ผ่าน
- Backend POST /auth/refresh ยังตอบ 500 ในรอบทดสอบล่าสุด จึงยังยืนยัน Remember Me restore/rotation แบบ end-to-end ไม่ได้ ส่วน Frontend เตรียมรับ contract และจัดการ failure แล้ว
- รอบนี้แก้เฉพาะ Frontend ไม่เปลี่ยน source Backend


## การใช้งานหลายแท็บ

เปิดแท็บใหม่ที่ origin เดียวกันสามารถขอ Access Token ที่ยังไม่หมดอายุจากแท็บที่ Login อยู่ผ่าน BroadcastChannel ได้ รวมถึงกรณีไม่ Remember Me โดย Token ยังคงอยู่ใน memory เท่านั้น และ Route Guard ตรวจ /me กับ Backend ก่อนแสดง Dashboard
หากไม่มีแท็บเดิมพร้อมส่ง Session จะ fallback ไป Refresh cookie (ต้องเลือก Remember Me) หากไม่มีทั้งสองอย่างต้อง Login ใหม่
ใช้ Web Locks จัดคิว Login/Refresh/Logout ข้ามแท็บ ป้องกันการหมุน Refresh cookie พร้อมกัน; Logout แจ้งทุกแท็บล้างสถานะ
Browser ที่ไม่รองรับ BroadcastChannel จะใช้ Refresh cookie; Browser ที่ไม่มี Web Locks ยังใช้ single-flight ภายในแท็บ แต่ไม่มีการล็อกข้ามแท็บ
Role Guard รอ restore เสร็จก่อนตรวจ role เพื่อรองรับการเปิด protected URL โดยตรง

