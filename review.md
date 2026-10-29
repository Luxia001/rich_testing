# สถานะหลังแก้ไข — 29 ตุลาคม 2026

- แก้ Rate Limit: Login/Register 10 ครั้ง/15 นาทีต่อ IP; Refresh แยก 120 ครั้ง/15 นาทีต่อ IP ไม่ใช้โควตาร่วมกันแล้ว
- ปรับ auth.integration.mjs ให้ตรวจ sessionExpiresAt และ /auth/me { user } ตาม API Contract ล่าสุด
- อัปเดต README หลักและ BE README ให้ตรง TTL ล่าสุด, limiter แยก, วิธีรันทดสอบและ Logout ด้วย expired Bearer
- เพิ่ม tests/auth-rate-limit.integration.mjs ตรวจการแยกโควตาทั้งสองทิศทาง รวม 429/RATE_LIMITED/Retry-After โดยไม่เขียน DB

ผลรันทดสอบหลังแก้:
- auth-rate-limit.integration.mjs: ผ่าน
- auth.integration.mjs กับ MySQL: ผ่าน Login/Origin/Role/Logout ทั้ง User และ Admin
- token-session.verify.mjs: ผ่าน expiry, rotation, replay revocation และ Logout
- token-session.verify.mjs --expiry-only: ผ่าน Refresh/Session หมดอายุและ expired-access Logout
- npm run typecheck: ผ่าน

ยังต้องตรวจ Browser End-to-End และหลายแท็บกับ BE จริงเพิ่มเติม โควตาแต่ละกลุ่มยังแชร์ภายใน IP เดียวกันตามนโยบาย limiter ปัจจุบัน

รายการด้านล่างเป็นประวัติผลตรวจ ปัญหา Rate Limit ร่วมและ assertion เก่าได้รับการแก้แล้ว ไม่ใช่งานค้างล่าสุด

---
# ผลตรวจ Token / Session ล่าสุด — 29 ตุลาคม 2026

ส่วนนี้เป็นผลตรวจใหม่ ให้ใช้แทนสถานะเดิมด้านล่างในรายการที่มีการเปลี่ยนโค้ด

## ผลที่ทดสอบแล้ว

ทดสอบ API จริงกับ MySQL ผ่าน `tests/token-session.verify.mjs` โดยใช้ TTL เฉพาะ Process ทดสอบ (Access 2 วินาที, Refresh 20 วินาที, Session 30 วินาที) ไม่แก้ `.env` และลบเฉพาะ Session ที่สร้างระหว่างทดสอบเมื่อจบ

- ผ่าน: Login, Bearer ที่ถูกต้อง, Token ที่แก้ไขถูกปฏิเสธ และ User เรียก Admin API ได้ 403
- ผ่าน: ไม่ Remember Me ไม่มี Refresh Token ในฐานข้อมูล และ Access/Session สิ้นสุดพร้อมกัน
- ผ่าน: Access หมดอายุได้ ACCESS_EXPIRED และ Remember Me ขอ Access ใหม่ได้
- ผ่าน: Refresh หมุน Token สำเร็จ ไม่ติด Foreign Key และไม่เลื่อนวันสิ้นสุด Session
- ผ่าน: ใช้ Refresh Token เก่าซ้ำได้ REFRESH_REUSED พร้อม revoke Session; Access และ Refresh ตัวใหม่ของ Session นั้นใช้ต่อไม่ได้
- ผ่าน: Logout เพิกถอน Access/Refresh ทันที และ Logout ซ้ำได้
- ผ่าน: Refresh Token ที่หมดอายุและ Session ที่หมดอายุถูกปฏิเสธ (ทดสอบโดยเปลี่ยน expiry ของรายการที่ชุดทดสอบสร้างเอง)
- ผ่าน: Logout ด้วย Access Token ที่หมดอายุแล้วและ Refresh หมดอายุแล้ว ยัง revoke Session ได้เมื่อ Bearer มีลายเซ็นถูกต้อง
- Angular unit tests ผ่าน 28/28 ด้วย ChromeHeadless รวม Auth Service, Interceptor, Gateway, Guards และ AuthTabs; ไม่ใช่ Browser End-to-End กับ BE จริง

รันทดสอบ BE ในโฟลเดอร์ be_login แยก Process เพื่อไม่ชน quota limiter:

```powershell
node --experimental-strip-types tests/token-session.verify.mjs
node --experimental-strip-types tests/token-session.verify.mjs --expiry-only
```

ชุดทดสอบส่ง Cookie header เอง จึงยังไม่พิสูจน์ Cookie Path/HTTPS ใน Browser จริง และยังไม่ทดสอบ Refresh แข่งกันหลายแท็บแบบครบวงจร

## ค่าใช้งานที่ตรวจจาก .env (เฉพาะค่า TTL ไม่อ่านออกมาแสดงความลับ)

- ACCESS_TTL_SECONDS=60
- REFRESH_TOKEN_TTL_SECONDS=90
- REMEMBER_ME_TTL_SECONDS=90
- COOKIE_SECURE=false สำหรับ Local HTTP

เมื่อ Remember Me และ Access หมดอายุที่ประมาณ 60 วินาที สามารถ Refresh ได้ภายในขีดจำกัด Session 90 วินาที Token ใหม่จะมีอายุสูงสุดเท่าเวลาที่ Session เหลือ เมื่อครบ 90 วินาทีต้อง Login ใหม่ นี่เป็นค่า Demo ไม่ใช่ Session 30 วัน

## สิ่งที่ยังต้องแก้/ตรวจต่อ

1. Rate Limit ของ Login/Register/Refresh ยังใช้ก้อนเดียว 10 ครั้ง/15 นาทีต่อ IP ทดสอบรวมแล้วพบ 429 จริง แม้ Session ที่กำลังทดสอบยังถูกต้อง ต้องแยก policy ของ Refresh ให้เหมาะสม
2. Integration Test เดิม auth.integration.mjs ยังตรวจ response fields เก่า ควรปรับก่อนใช้ตรวจรับ
3. README ที่บันทึกค่า Refresh 20/30 วินาทีไม่ตรง fallback ล่าสุดที่เป็น 90 วินาที ควรอัปเดตตาม config ล่าสุด
4. ต้องตรวจ Browser End-to-End, Cookie Path และ Refresh/Logout แข่งกันข้ามแท็บเพิ่มเติม

สรุป: วงจร Token/Session ฝั่ง Backend ในกรณีที่ทดสอบทำงานถูกต้องแล้ว รวมถึงบั๊ก Foreign Key เดิม แต่ยังไม่ถือว่าทุกสถานการณ์ผ่านครบ และยังมีปัญหา Rate Limit ร่วม

---
# Review เทียบข้อกำหนด Doc.txt

วันที่ตรวจ: 29 ตุลาคม 2026 (Asia/Bangkok)
ขอบเขต: ตรวจ Source Code ปัจจุบันของ Angular/Express, Prisma Schema/Migration, Tests และ README เทียบกับ Doc.txt
เอกสารนี้บันทึกสิ่งที่ต้องแก้ไข ยังไม่ได้แก้โค้ดหรือ README และไม่ได้ยืนยันว่าทดสอบ End-to-End ผ่านแล้ว

## สรุปผล

ระบบมี Login, Role-Based Dashboard, Backend Authorization, Logout และโครง Access/Refresh Token แล้ว แต่ยังไม่ควรระบุว่าส่งมอบครบ เพราะพบข้อผิดพลาดใน Refresh Rotation ซึ่งเป็นข้อกำหนดหลัก Part B รวมทั้ง Test และ README ยังตามโค้ดล่าสุดไม่ทัน

ข้อสรุปเดิมใน README ว่า “ยังไม่มี /auth/refresh” ไม่ตรงกับ Source ล่าสุด ต้องใช้ผลตรวจในเอกสารนี้แทนในการจัดงานถัดไป

## รายการที่ต้องแก้ ตามลำดับความสำคัญ

### R1 — P1: Refresh Rotation อ้าง Foreign Key ก่อนสร้าง Token ใหม่

ข้อกำหนด: Part B ต้องขอ Access Token ใหม่ได้เมื่อเลือก Remember Me และ Refresh Session ยังใช้ได้

หลักฐาน:
- `be_login/src/features/auth/auth.service.ts:94` อัปเดต Token เก่าด้วย `replacedById: replacementId` ที่บรรทัด 96
- สร้าง Token ใหม่ซึ่งมี ID นี้ภายหลังที่บรรทัด 103
- `be_login/prisma/schema.prisma` และ Migration `20261029000000_initial_schema/migration.sql` กำหนด Foreign Key จาก `replaced_by_id` ไปยัง `refresh_tokens.id`

ผลกระทบ: บน MySQL ที่ใช้ Foreign Key ตาม Migration การ UPDATE จะอ้างรายการที่ยังไม่มีและถูกปฏิเสธ Transaction จึงไม่สำเร็จ Refresh แรก รวมถึง Restore หลัง reload สำหรับ Remember Me จะล้มเหลว ข้อนี้เป็นข้อค้นพบจาก Source/Schema ยังไม่ได้ยืนยันด้วยการยิง Refresh สำเร็จถึงฐานข้อมูลในรอบตรวจนี้

แนวทางแก้:
1. ใช้ Transaction ยึดสิทธิ์ใช้ Token เก่าด้วย conditional update เฉพาะ `usedAt` ก่อน
2. สร้าง Token ใหม่ แล้วจึงอัปเดต `replacedById` ให้ชี้รายการที่มีอยู่แล้ว
3. คงการป้องกันการใช้ซ้ำ/Concurrency และการ revoke Session เมื่อพบ replay

เกณฑ์ตรวจรับ:
- Login แบบ Remember Me แล้ว Refresh ได้ 200 พร้อม Access/Refresh Token ใหม่
- Token เก่าเป็น used และเชื่อมกับ Token ใหม่ถูกต้อง
- วันสิ้นสุด Session ไม่ถูกเลื่อนออกไป
- ใช้ Refresh Token เก่าซ้ำแล้ว Session ถูก revoke และ Access Token ของ Session นั้นเรียก API ไม่ได้

### R2 — P2: Integration Test ยังตรวจ Response เก่าและยังไม่ครอบคลุม Refresh Lifecycle

ข้อกำหนด: Part B/D/E และ Deliverables ข้อ 5 ต้องแสดงว่าทั้ง Remember Me, Token หมดอายุ และ Logout ทำงานถูกต้อง

หลักฐาน:
- `be_login/tests/auth.integration.mjs:38` ตรวจ `info.expiresAt` แต่ Login Controller ปัจจุบันส่ง `accessExpiresAt` และ `sessionExpiresAt`
- บรรทัด 55 ตรวจ `restored.rememberMe` แต่ `/auth/me` ปัจจุบันส่ง `{ user }`
- Test นี้ยังไม่มีขั้นตอนเรียก `/auth/refresh`, ทดสอบ Rotation, Token หมดอายุจริง หรือ Replay

ผลกระทบ: แม้เชื่อม API/DB ได้ Test จะหยุดที่ assertion รูปแบบเก่า และยังตรวจไม่พบปัญหา R1

แนวทางแก้: เปลี่ยน assertion ให้ตรง API Contract ล่าสุด และเพิ่มกรณีต่อไปนี้โดยใช้ฐานข้อมูลทดสอบและ TTL สั้น:
- Remember Me: Access หมดอายุ → Refresh → เรียก API ต่อได้
- ไม่ Remember Me: ไม่มี Refresh Token และหมดอายุแล้วต้อง Login ใหม่
- Refresh หมดอายุ/ผิด/ถูก revoke → 401 และไม่มี retry loop ฝั่ง FE
- Rotation/replay, Logout แล้วใช้ Access/Refresh เดิมไม่ได้ และ Logout เมื่อ Access หมดอายุ
- คำขอหลายรายการหมดอายุพร้อมกันในแท็บเดียวต้องแชร์ Refresh หนึ่งครั้ง

เกณฑ์ตรวจรับ: รัน Test ที่ปรับแล้วผ่านและบันทึกผลจริง รวมถึงทดสอบ Browser ผ่าน Proxy เพราะ Test ที่ส่ง Cookie header เองไม่ได้พิสูจน์ Cookie Path ใน Browser

### R3 — P2: README อธิบาย Token Strategy และวิธีทดสอบไม่ตรงโค้ดล่าสุด

ข้อกำหนด: Deliverables ข้อ 2, 4, 5 และ 6

หลักฐานใน README:
- บรรทัด 29 อธิบาย JWT ใน Cookie `access_token` แต่โค้ดส่ง Access Token กลับใน JSON และเก็บใน FE memory
- บรรทัด 37 และตาราง Deliverables ยังระบุ Session เริ่มต้น 8 ชั่วโมง แต่ env.ts/.env.example ล่าสุดกำหนด 900 วินาที
- บรรทัด 42 ระบุไม่มี `/auth/refresh` แต่ Routes และ Gateway ล่าสุดมี Endpoint นี้แล้ว
- หัวข้อทดสอบและรายการงานค้างยังอธิบาย Cookie/Refresh ตามระบบรุ่นก่อน

แนวทางแก้:
- อธิบาย Access JWT อายุ 15 นาทีใน memory และ opaque Refresh Token เฉพาะ Remember Me ใน HttpOnly Cookie `refresh_token` พร้อมเก็บ hash ใน DB
- อธิบาย Refresh Session สูงสุด 30 วัน โดย Refresh ไม่ขยายวันสิ้นสุด
- อธิบายไม่ Remember Me: reload ต้อง Login ใหม่เพราะ Access Token หายจาก memory; แม้ Session ใน DB อาจเหลืออายุมากกว่า Access Token ก็ไม่มีสิทธิ์ Refresh
- เพิ่ม `ACCESS_TTL_SECONDS` และ `REFRESH_COOKIE_PATH` ในตัวอย่าง Environment
- Demo ใช้ ACCESS_TTL_SECONDS=60, SESSION_TTL_SECONDS=60, REMEMBER_ME_TTL_SECONDS=300 เพื่อเห็น Refresh ขณะ Session ยังไม่หมดอายุ
- แก้ตาราง API, คำอธิบาย Postman/Bearer และสถานะงานให้ตรงกันทั้ง README หลักและ BE README
- ระบุ Cookie Path `/api/auth` สำหรับ Browser ผ่าน FE Proxy; หากเรียกตรง BE ด้วย Cookie Jar ต้องตั้ง Path ให้ตรง URL ที่ใช้

เกณฑ์ตรวจรับ: คนใหม่ทำตาม README แล้วรันและทดสอบได้ โดยแยกชัดว่าส่วนใดมีโค้ดแล้ว ส่วนใดมีบั๊ก และส่วนใดทดสอบผ่านจริง

### R4 — P2: Login และ Refresh ใช้ Rate Limit ก้อนเดียวจนการ Restore ปกติทำให้ถูกบังคับ Login ใหม่

ข้อกำหนด: Part B ต้องกลับมาใช้งานต่อได้ภายใน Refresh Session และ Part E ต้องจัดการความผิดพลาดเหมาะสม

หลักฐาน:
- `be_login/src/features/auth/auth.routes.ts:9` ใช้ limiter เดียวกัน 10 ครั้ง/15 นาที สำหรับ register, login และ refresh
- `HttpAuthGateway.restore()` เรียก Refresh ทุกครั้งที่เปิดแอปใหม่
- `AuthService.refresh()` ล้างสถานะเมื่อ Refresh error รวมถึง 429

ผลกระทบ: Login และ reload รวมเกิน 10 ครั้งภายใน 15 นาที หรือหลายผู้ใช้ที่มี IP เดียวกันใช้ quota ร่วมกัน จะถูก 429 แม้ Refresh Session ยังถูกต้อง และการ Refresh ระหว่างใช้งานจะพาออกจากระบบ

แนวทางแก้: แยก limiter ของ Login และ Refresh กำหนด quota เหมาะกับการใช้งาน Refresh/Restore จริง และแสดงข้อความรอที่ตรงกับ 429 โดยไม่ retry วน

เกณฑ์ตรวจรับ: Login ผิดถี่ถูกจำกัดตาม policy แต่ Refresh/Restore ตามรูปแบบใช้งานปกติไม่ถูกนับรวมกับ quota เดารหัสผ่าน และ 429 ไม่ทำให้เกิด loop

## ตารางเทียบข้อกำหนด

| ข้อกำหนด | สถานะจาก Source | สิ่งที่ต้องทำต่อ |
| --- | --- | --- |
| Part A: Email/Password/Remember Me/Login/Error | มี Form, Validation และ Loading | ตรวจ Browser ด้วยบัญชี Seed จริง |
| Part A: แสดงชื่อและ Role | มี displayName/role ใน Dashboard | ตรวจทั้ง User/Admin |
| Part B: Remember Me กลับมาใช้งานต่อ | มี Refresh Cookie และ Restore Flow | แก้ R1 แล้วตรวจ reload/เปิดใหม่ |
| Part B: Access หมดอายุแล้ว Refresh ได้ | มี Routes, Gateway, Interceptor และ Rotation | แก้ R1 และเพิ่มผลทดสอบตาม R2 |
| Part B: Refresh ผิด/หมดอายุ/revoke ต้อง Login | มี validation และ FE ล้างสถานะ | ทดสอบจริงให้ครบทุกกรณี |
| Part B: ไม่ Remember Me ไม่ต่ออายุอัตโนมัติ | canRefresh ตรวจ rememberMe และไม่มี Refresh Token ตอน Login | ทดสอบหมดอายุ/ไม่มี Cookie/reload |
| Part C: Dashboard สอง Role | มี UI แยกข้อความและ Route Guards | ไม่จำเป็นต้องเพิ่ม Dashboard ซับซ้อน |
| Part D: ตรวจ Token/Role ฝั่ง BE | มี Bearer verification, DB Session และ Role middleware | ทดสอบ direct API 401/403 และ Token แก้ไข |
| Part D: ไม่เก็บ Password Plain Text | ใช้ Argon2id ทั้ง Login/Seed | ยืนยันข้อมูลในฐานทดสอบ |
| Part E: Logout เพิกถอน Session | มี revoke จาก Bearer/Refresh และ clear Cookie | ทดสอบ Access หมดอายุและ Logout ซ้ำ |
| Part E: Refresh ไม่วนซ้ำ | Interceptor retry request เดิมครั้งเดียว และ Auth Service แชร์ Refresh | ทดสอบ failure/concurrent requests |
| Part E: Loading/Error | มี Login, initial restore และปุ่มตรวจ Session | ตรวจ UX ระหว่าง Refresh อัตโนมัติ/Network error |
| Deliverables 1: Source Angular/Express | มีใน Workspace | ตรวจ Source อยู่ในชุดส่งมอบจริง |
| Deliverables 2–6: README/บัญชี/Strategy/วิธีทดสอบ/สถานะ | มีหัวข้อครบแต่ข้อมูลบางส่วนเก่า | แก้ R3 และแนบผลทดสอบจริง |

## ผลการตรวจคำสั่งในรอบนี้

- BE `npm run typecheck`: ผ่าน
- FE `npm run build`: ผ่าน มีคำเตือน login.css ขนาด 6.44 kB เกิน warning budget 4 kB; ไม่ใช่ข้อขัดข้องหลักตาม Doc
- BE `node --experimental-strip-types tests/auth.integration.mjs`: ไม่ผ่าน จบด้วย `fetch failed` จึงยังไม่ได้ยืนยัน API/DB Lifecycle ในรอบนี้ สาเหตุการเชื่อมต่อต้องตรวจเพิ่ม ไม่สรุปว่าเป็นบั๊กของ Authentication จากข้อความนี้เพียงอย่างเดียว
- ยังไม่ได้รัน Browser End-to-End และ FE unit tests ในรอบตรวจนี้

## ลำดับงานที่เสนอ

1. แก้ R1 ให้ Refresh สำเร็จบน MySQL จริง
2. ปรับ Test ตาม R2 แล้วตรวจ Lifecycle และ Authorization
3. แก้ Rate Limit R4 และทดสอบผลกระทบ Restore/หลายคำขอ
4. อัปเดต README ตาม R3 ด้วยพฤติกรรมที่ตรวจแล้ว
5. บันทึกผลทดสอบและข้อจำกัดก่อนระบุว่าส่งมอบครบ

MySQL เป็นตัวเลือกที่ Doc อนุญาต ไม่จำเป็นต้องย้ายเป็น PostgreSQL ส่วน MFA, ลืมรหัสผ่าน, ระบบสมัครสมาชิกหรือ Dashboard ซับซ้อนไม่ใช่งานจำเป็นในขอบเขตนี้ การเก็บ Access Token ใน memory และนโยบาย reload เป็นการตัดสินใจออกแบบที่ต้องอธิบาย ไม่ใช่ข้อบังคับรูปแบบเดียวจาก Doc


