import { Injectable } from '@angular/core';
import { AuthGateway, AuthSession, AuthUser } from './auth.models';

const STORAGE_KEY = 'rich.demo.session.v1';
const ACCESS_MS = 60_000;
const SESSION_MS = 300_000;
const USERS: AuthUser[] = [
  { id: 'demo-user', email: 'user@rich.demo', displayName: 'Rich User', role: 'user' },
  { id: 'demo-admin', email: 'admin@rich.demo', displayName: 'Rich Admin', role: 'admin' },
];

// Demo-only browser adapter. Replace this provider with an HTTP adapter for a real server.
@Injectable({ providedIn: 'root' })
export class MockAuthGateway implements AuthGateway {
  private current: AuthSession | null = null;
  private delay(): Promise<void> { return new Promise(resolve => setTimeout(resolve, 350)); }

  async login(email: string, password: string, rememberMe: boolean): Promise<AuthSession> {
    await this.delay();
    const user = USERS.find(candidate => candidate.email === email.trim().toLowerCase());
    if (!user || password !== 'Demo123!') throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    const now = Date.now();
    const session: AuthSession = {
      user: { ...user }, rememberMe, accessExpiresAt: now + ACCESS_MS,
      sessionExpiresAt: now + (rememberMe ? SESSION_MS : ACCESS_MS),
    };
    this.save(session);
    return session;
  }

  async restore(): Promise<AuthSession | null> {
    await this.delay();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as AuthSession;
      const user = USERS.find(candidate => candidate.id === saved?.user?.id);
      if (!user || saved.rememberMe !== true || !Number.isFinite(saved.sessionExpiresAt)
          || saved.sessionExpiresAt <= Date.now() || saved.sessionExpiresAt > Date.now() + SESSION_MS) {
        this.clear(); return null;
      }
      this.current = { ...saved, user: { ...user } };
      return await this.refresh();
    } catch { this.clear(); return null; }
  }

  async refresh(): Promise<AuthSession> {
    await this.delay();
    if (!this.current?.rememberMe || this.current.sessionExpiresAt <= Date.now()) {
      this.clear(); throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }
    const session = { ...this.current, accessExpiresAt: Math.min(Date.now() + ACCESS_MS, this.current.sessionExpiresAt) };
    this.save(session);
    return session;
  }

  async logout(): Promise<void> { await this.delay(); this.clear(); }

  private save(session: AuthSession): void {
    // Only mock session metadata is persisted. Never persist passwords or real tokens here.
    try {
      if (session.rememberMe) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { throw new Error('ไม่สามารถจัดเก็บ Session ได้ กรุณาอนุญาตพื้นที่จัดเก็บของเบราว์เซอร์'); }
    this.current = session;
  }
  private clear(): void {
    this.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
}
