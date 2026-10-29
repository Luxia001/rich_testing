import 'dotenv/config';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.ACCESS_TTL_SECONDS='2';
process.env.REMEMBER_ME_TTL_SECONDS='30';
process.env.REFRESH_TOKEN_TTL_SECONDS='20';
const {app}=await import('../src/app.ts');
const {database}=await import('../src/config/database.ts');
const server=app.listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const ids=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function call(path,{token,cookie,body}={}) {
 const payload=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:payload?'POST':'GET',headers:{...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...(cookie?{Cookie:cookie}:{})}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{resolve({status:res.statusCode,data:text?JSON.parse(text):null,cookies:res.headers['set-cookie']??[]});}catch(e){reject(e);}});
  });req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('request timeout')));if(payload)req.write(payload);req.end();
 });
}
const cookie=r=>r.cookies.find(c=>c.startsWith('refresh_token='))?.split(';')[0];
async function login(rememberMe,role='user') {
 const r=await call('/auth/login',{body:{email:`${role}@rich.demo`,password:process.env.DEMO_ACCOUNT_PASSWORD??'Demo123!',rememberMe}});
 assert.equal(r.status,200,'Demo login must succeed');
 const sid=JSON.parse(Buffer.from(r.data.accessToken.split('.')[1],'base64url')).sid;ids.push(sid);
 return {...r,sid,token:r.data.accessToken,cookie:cookie(r)};
}
try {
 assert.equal((await call('/health')).status,200,'MySQL must be available');console.log('PASS health/database');
 if (!process.argv.includes('--expiry-only')) {
 const temp=await login(false);
 assert.equal(temp.data.accessExpiresAt,temp.data.sessionExpiresAt);
 assert.equal(await database.refreshToken.count({where:{sessionId:temp.sid}}),0);
 assert.equal((await call('/auth/me',{token:temp.token})).status,200);
 assert.equal((await call('/admin/sessions',{token:temp.token})).status,403);
 const remembered=await login(true,'admin');
 assert.ok(remembered.cookies.some(c=>/HttpOnly/.test(c)&&/Path=\/api\/auth/.test(c)));
 assert.equal((await call('/admin/sessions',{token:remembered.token})).status,200);
 assert.equal((await call('/auth/me',{token:remembered.token.slice(0,-4)+'xxxx'})).status,401);
 console.log('PASS roles, invalid token, no refresh token without Remember Me');
 await pause(2200);
 assert.equal((await call('/auth/me',{token:temp.token})).data.error.code,'ACCESS_EXPIRED');
 assert.equal((await call('/auth/refresh',{body:{}})).status,401);
 assert.equal((await call('/auth/me',{token:remembered.token})).data.error.code,'ACCESS_EXPIRED');
 const rotated=await call('/auth/refresh',{cookie:remembered.cookie,body:{}});
 assert.equal(rotated.status,200,'Refresh after access expiry');
 assert.equal(rotated.data.sessionExpiresAt,remembered.data.sessionExpiresAt);
 assert.notEqual(cookie(rotated),remembered.cookie);
 assert.equal((await call('/auth/me',{token:rotated.data.accessToken})).status,200);
 console.log('PASS access expiry, refresh rotation and unchanged session deadline');
 assert.equal((await call('/auth/refresh',{cookie:remembered.cookie,body:{}})).data.error.code,'REFRESH_REUSED');
 assert.equal((await call('/auth/me',{token:rotated.data.accessToken})).status,401);
 assert.equal((await call('/auth/refresh',{cookie:cookie(rotated),body:{}})).status,401);
 console.log('PASS replay revokes access and replacement refresh token');
 const out=await login(true);
 assert.equal((await call('/auth/logout',{token:out.token,cookie:out.cookie,body:{}})).status,204);
 assert.equal((await call('/auth/me',{token:out.token})).status,401);
 assert.equal((await call('/auth/refresh',{cookie:out.cookie,body:{}})).status,401);
 assert.equal((await call('/auth/logout',{token:out.token,cookie:out.cookie,body:{}})).status,204);
 console.log('PASS logout revocation and repeated logout');
 }
 if (process.argv.includes('--expiry-only')) {
 const exp=await login(true);
 await database.refreshToken.updateMany({where:{sessionId:exp.sid},data:{expiresAt:new Date(Date.now()-1000)}});
 assert.equal((await call('/auth/refresh',{cookie:exp.cookie,body:{}})).data.error.code,'REFRESH_INVALID');
 const session=await login(true);
 await database.session.update({where:{id:session.sid},data:{expiresAt:new Date(Date.now()-1000)}});
 assert.equal((await call('/auth/me',{token:session.token})).data.error.code,'SESSION_REVOKED');
 assert.equal((await call('/auth/refresh',{cookie:session.cookie,body:{}})).status,401);
 await pause(2200);
 assert.equal((await call('/auth/logout',{token:exp.token,cookie:exp.cookie,body:{}})).status,204);
 assert.ok((await database.session.findUnique({where:{id:exp.sid}})).revokedAt);
 console.log('PASS refresh/session expiry and logout with expired access');
 }
} catch(e) {console.error('FAIL',e instanceof Error?e.message:'unknown failure');process.exitCode=1;}
finally {
 if(ids.length)await database.session.deleteMany({where:{id:{in:ids}}});
 await new Promise(r=>server.close(r));await database.$disconnect();
}

