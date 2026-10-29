import 'dotenv/config';
import assert from 'node:assert/strict';
import { app } from '../src/app.ts';
import { database } from '../src/config/database.ts';
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = process.env.AUTH_TEST_BASE_URL ?? `http://127.0.0.1:${server.address().port}`;
const cookies = [];
async function request(path, { cookie, body, origin } = {}) {
  return fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  const health = await request('/health');
  assert.equal(health.status, 200, 'Database must be available');
  console.log('PASS health/database');
  const guest = await request('/auth/me');
  assert.equal(guest.status, 401);
  const rejectedOrigin = await request('/auth/login', { body: {}, origin: 'https://untrusted.example' });
  assert.equal(rejectedOrigin.status, 403);
  console.log('PASS guest rejection and Origin validation');
  const password = process.env.DEMO_ACCOUNT_PASSWORD;
  assert.ok(password, 'Set DEMO_ACCOUNT_PASSWORD for existing seeded demo accounts');
  const invalid = await request('/auth/login', { body: { email: 'user@rich.demo', password: 'incorrect-password' } });
  assert.equal(invalid.status, 401);
  console.log('PASS wrong password');
  for (const role of ['user', 'admin']) {
    const login = await request('/auth/login', { body: { email: `${role}@rich.demo`, password, rememberMe: role === 'admin' }, origin: 'http://localhost:4200' });
    assert.equal(login.status, 200, `${role} demo account must exist`);
    const info = await login.json();
    assert.equal(info.user.role, role);
    assert.ok(Date.parse(info.expiresAt) > Date.now());
    const header = login.headers.get('set-cookie');
    assert.ok(header?.includes('HttpOnly'));
    assert.equal(/Max-Age=/i.test(header), role === 'admin');
    const cookie = header.split(';')[0];
    cookies.push(cookie);
    const me = await request('/auth/me', { cookie });
    assert.equal(me.status, 200);
    const restored = await me.json();
    assert.equal(restored.user.role, role);
    assert.equal(restored.rememberMe, role === 'admin');
    assert.equal(restored.expiresAt, info.expiresAt);
    const sessions = await request('/admin/sessions', { cookie });
    assert.equal(sessions.status, role === 'admin' ? 200 : 403);
    console.log(`PASS ${role}: login, cookie persistence policy, restore metadata and authorization`);
    const logout = await request('/auth/logout', { cookie, body: {} });
    assert.equal(logout.status, 204);
    assert.ok(logout.headers.get('set-cookie')?.includes('Expires='));
    assert.equal((await request('/auth/me', { cookie })).status, 401);
    assert.equal((await request('/auth/logout', { cookie, body: {} })).status, 204);
    console.log(`PASS ${role}: logout revokes old cookie and repeated logout succeeds`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Integration check failed');
  process.exitCode = 1;
} finally {
  for (const cookie of cookies) {
    try { await request('/auth/logout', { cookie, body: {} }); } catch {}
  }
  await new Promise(resolve => server.close(resolve));
  await database.$disconnect();
}
