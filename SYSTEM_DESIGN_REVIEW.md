# ผลตรวจระบบเทียบ SYSTEM_DESIGN_PLAN.md

วันที่ตรวจ: 29 ตุลาคม 2026
ขอบเขต: ตรวจ source Frontend/Backend และรันตรวจสอบที่ไม่ต้องเชื่อม API/ฐานข้อมูลตามขอบเขตเดิม ไม่ได้แก้ application code
พบเอกสารชื่อ SYSTEM_DESIGN_PLAN.md ไม่พบ systemdesign.md

## ภาพรวม

Frontend ใช้ Angular Reactive Form และ MockAuthGateway ไม่ได้เรียก Backend เป็นการทำตามคำขอก่อนหน้าที่ให้ยังไม่เชื่อม API จึงไม่ถือว่าการไม่มี HTTP integration เป็น regression แต่ยังไม่ครบระบบจริงตามเอกสารออกแบบ
Backend เป็น Express + Prisma + SQL Server ไม่ใช่ PostgreSQL ตามเอกสาร จึงต้องปรับเอกสารหรือยืนยันสถาปัตยกรรมก่อนพัฒนาต่อ ไม่ควรย้ายฐานข้อมูลเพียงเพื่อทำให้ตรงเอกสารโดยไม่พิจารณาสถานะปัจจุบัน

## สิ่งที่มีแล้ว

- Reactive Form, required/email validation, show/hide password, loading/error และป้องกันส่งซ้ำ
- บัญชี User/Admin จำลอง แสดง displayName/email/role และ Dashboard ตามบทบาท
- เส้นทาง login/user/admin/forbidden/fallback, guest/auth/role guards และ returnUrl whitelist
- Restore ก่อนแสดง router outlet
- Mock Access 60 วินาที, Remember Me 5 นาที, fixed Session deadline, single-flight refresh ใน service, Logout
- Backend มี Argon2id, JWT HS256 issuer/audience verification, ตรวจ active Session/disabled user/role จาก DB, Admin middleware และจำกัด Session list 100 รายการ
- Schema มี displayName/disabledAt และ RefreshToken model แล้ว แต่ RefreshToken ยังไม่ถูกใช้งานใน auth service
- Backend start script ชี้ dist/server.js ตรง main แล้ว ข้อความเดิมในแผนที่ระบุว่า start ผิดจึงล้าสมัย

## ข้อผิดพลาดและความไม่ตรงแผน

| ระดับ | รายการ | หลักฐาน/ผลกระทบ |
|---|---|---|
| P1 | Backend typecheck/build ล้มเหลว | tsconfig.json ตั้ง rootDir=src แต่ไม่มี include จำกัดไฟล์ จึงรวม prisma/seed.ts แล้วเกิด TS6059 ทั้งสองคำสั่ง |
| P2 | ไม่เลือก Remember Me แต่ยัง Login ไม่ได้เมื่อ storage ถูกบล็อก | mock-auth.gateway.ts save() เรียก removeItem() และโยน error; ทดสอบด้วย localStorage ที่ throw แล้วทำซ้ำได้ แม้ flow นี้ใช้ memory |
| P1 ก่อนเชื่อมจริง | ยังไม่มี Refresh Token lifecycle | มี schema แต่ไม่มี POST /auth/refresh, สุ่ม/hash token, rotation transaction/lock และ replay revocation |
| P1 ก่อนเชื่อมจริง | Token contract ต่างจากแผน | Backend เก็บ Access JWT ใน cookie และ requireAuth อ่าน cookie; Login response ไม่มี accessToken/accessExpiresAt/sessionExpiresAt ตาม contract; แผนต้องการ Access ใน memory + Bearer และ Refresh ใน HttpOnly cookie |
| P2 | TTL และ cookie policy ไม่ตรงแผน | Backend default Access/Session เป็น 8 ชั่วโมง หรือ 30 วัน; cookie มี Max-Age แม้ rememberMe=false และ Path=/; แผน Access 15 นาทีเท่ากัน และ Refresh cookie เฉพาะ Remember Me ที่ /api/auth |
| P2 | Logout เมื่อ token หมดอายุหรือทำซ้ำไม่สำเร็จตาม contract | /logout อยู่หลัง requireAuth จึงคืน 401 ก่อน revoke/clear cookie เมื่อ JWT หมดอายุ หรือ Session ถูก revoke ไปแล้ว |
| P2 | Login ใหม่ไม่ revoke Session เดิมของ browser | login สร้าง Session ใหม่ทันที แล้วเขียนทับ cookie โดยไม่ได้ revoke Session ที่ cookie เก่าอ้างถึง |
| P2 ก่อนเชื่อมจริง | ขาด Origin validation และ Cache-Control: no-store | app/routes ปัจจุบันยังไม่มี middleware เหล่านี้ตามข้อ 9 ของแผน |
| P2 ก่อนเชื่อมจริง | Error contract ยังเป็น string | Backend ส่ง {error: string} ไม่มี code แยก ACCESS_EXPIRED/SESSION_REVOKED/FORBIDDEN ตามแผน จึงยังใช้ตัดสิน refresh/retry ตาม contract ไม่ได้ |
| P2 | Invalid JSON / body ใหญ่เกินถูกเปลี่ยนเป็น 500 | express.json สร้าง error แต่ errorHandler ตอบ 500 ทุกกรณี ควรคงสถานะ 400/413 ตามชนิด error |
| P2 | Seed มีเฉพาะ Admin | prisma/seed.ts ไม่มี seed User; บัญชีจำลองใน Angular ไม่ใช่บัญชีฐานข้อมูลและไม่รับประกันว่าจะ Login กับ API ได้ |
| เอกสาร | ฐานข้อมูลและสถานะงานไม่ตรงความเป็นจริง | แผนระบุ PostgreSQL/routes ว่าง/displayName ยังไม่มี/start ผิด แต่ source ปัจจุบันใช้ SQL Server และแก้ส่วนเหล่านี้บางส่วนแล้ว |

## งานที่ยังขาดตามแผนเต็ม

- HTTP AuthGateway, HttpClient/interceptor, แนบ Bearer เฉพาะ API นี้, จำกัด retry 1 ครั้งและไม่ refresh จาก login/refresh/logout/403
- /auth/me และ /admin/sessions integration; Admin UI ปัจจุบันแสดงเพียง Session จำลองของตัวเอง
- Network error แยกจาก credential error, Logout ฝั่ง Server ล้มเหลวพร้อมสถานะและปุ่มลองใหม่
- Access/Refresh TTL ที่ตั้งผ่าน environment สำหรับโหมดปกติและ demo (Frontend ปัจจุบัน hardcode)
- Refresh endpoint limiter, token/session cleanup job, seed User และ integration tests กับ DB ทดสอบ
- Reverse proxy/development proxy สำหรับ /api และเอกสาร deployment ที่ตรงฐานข้อมูลจริง
- หลายแท็บยังไม่ประสาน refresh/logout ผ่าน Web Locks/BroadcastChannel; เป็นข้อจำกัดที่ README ประกาศไว้แล้ว
- ห้ามใช้ metadata ใน localStorage ของ Mock เป็นหลักฐานยืนยันตัวตนจริง; ตอนนี้ไม่มี server authority ตามเจตนาของ demo

## ผลทดสอบ

- Backend npm run typecheck: ไม่ผ่าน TS6059
- Backend npm run build: ไม่ผ่าน TS6059; ไม่ได้ถือว่าการมี dist เก่าหรือไฟล์ที่ compiler อาจ emit เป็น build ที่ผ่าน
- ทดสอบ Mock gateway source จริงผ่าน TypeScript transpilation ใน Node โดยแทนเวลา/delay/storage: ผ่าน User login, wrong password rejection, reload ไม่ Remember Me, Admin normalization, remembered restore, fixed deadline refresh, logout และหมดอายุ
- จำลอง storage ถูกบล็อก: ทำซ้ำ bug Login ไม่ Remember Me ล้มเหลวได้
- Frontend production build ล่าสุดก่อนการตรวจนี้สำเร็จ มี warning login.css 6.44 kB เทียบ warning budget 4 kB; การตรวจนี้ไม่ได้แก้ source หรือรัน production build ซ้ำ
- Angular test suite: ดูผลล่าสุดด้านล่าง แยกจาก isolated Node checks ซึ่งไม่ใช่การทดสอบ DOM/Router/Browser จริง
- ยังไม่ได้ทดสอบ live API, SQL Server connection, migration/seed, server revocation, HTTP cookies หรือ Browser end-to-end จึงไม่ยืนยันว่าเกณฑ์เหล่านี้ผ่าน

## ลำดับแก้ไขที่แนะนำ

1. แก้ tsconfig include/rootDir เพื่อให้ Backend typecheck/build ผ่าน
2. แก้ Mock Login ให้ไม่พึ่ง storage ใน Session ที่ไม่ Remember Me และเพิ่ม regression test
3. อัปเดตเอกสารให้ระบุ SQL Server/Prisma และสถานะ Frontend Mock อย่างชัดเจน
4. เมื่อเริ่มงานเชื่อม API ค่อยทำ contract/token lifecycle/Logout/Origin/error codes ให้ครบก่อนต่อ HTTP adapter
5. เติม integration tests สำหรับ authorization/rotation/replay/logout และ Browser tests ของ guard/session expiry

ผล Angular test suite ล่าสุด: test bundle compile สำเร็จ แต่ ChromeHeadless เปิดไม่สำเร็จครบ 3 ครั้งและคำสั่งจบด้วย exit code 1 จึงยังไม่ยืนยันผล Jasmine tests หรือ Browser flow
