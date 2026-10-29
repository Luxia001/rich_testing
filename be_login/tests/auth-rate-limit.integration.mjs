// No database writes: invalid login input and missing refresh cookies stop before DB access.
import 'dotenv/config';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/app.ts';
import { database } from '../src/config/database.ts';
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
function post(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } }, response => {
      let text = '';
      response.on('data', chunk => text += chunk);
      response.on('end', () => {
        try { resolve({ status: response.statusCode, data: JSON.parse(text), retryAfter: response.headers['retry-after'] }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('request timeout')));
    req.end('{}');
  });
}
try {
  // Refresh attempts do not spend login quota.
  for (let i = 0; i < 11; i++) assert.equal((await post('/auth/refresh')).status, 401);
  for (let i = 0; i < 10; i++) assert.equal((await post('/auth/login')).status, 400);
  assert.equal((await post('/auth/login')).status, 429);
  // Exhausting login quota does not block refresh.
  assert.equal((await post('/auth/refresh')).status, 401);
  for (let i = 12; i < 120; i++) assert.equal((await post('/auth/refresh')).status, 401);
  const limited = await post('/auth/refresh');
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.retryAfter) > 0);
  console.log('PASS independent login/refresh quotas, refresh abuse limit and Retry-After');
} finally {
  await new Promise(resolve => server.close(resolve));
  await database.$disconnect();
}
