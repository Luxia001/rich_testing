import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthGateway, AuthSession } from './auth.models';
import { AuthApiError, HttpAuthGateway } from './http-auth.gateway';

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY', {
  providedIn: 'root', factory: () => inject(HttpAuthGateway),
});
@Injectable({ providedIn: 'root' })
export class AuthService {
  private gateway = inject(AUTH_GATEWAY);
  private router = inject(Router);
  private state = signal<AuthSession | null>(null);
  readonly session = this.state.asReadonly();
  readonly ready = signal(false);
  readonly notice = signal('');
  readonly logoutPending = signal(false);
  private pendingLogoutToken?: string;
  private restoration?: Promise<void>;
  private refreshing?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  sessionVersion(): number { return this.generation; }
  accessToken(): string | undefined { return this.state()?.accessToken; }
  canRefresh(): boolean {
    const session = this.state();
    return !!session?.rememberMe && session.sessionExpiresAt > Date.now() && !this.logoutPending();
  }
  restoreSession(): Promise<void> {
    return this.restoration ??= (async () => {
      const generation = this.generation;
      try {
        const session = await this.gateway.restore();
        if (generation === this.generation) this.accept(session);
      } catch (error) { this.notice.set(error instanceof Error ? error.message : 'คืนสถานะไม่สำเร็จ กรุณาลองใหม่'); }
      finally { this.ready.set(true); }
    })();
  }
  async login(email: string, password: string, rememberMe: boolean): Promise<void> {
    const generation = ++this.generation;
    const session = await this.gateway.login(email, password, rememberMe);
    if (generation !== this.generation) throw new Error('การเข้าสู่ระบบถูกยกเลิก กรุณาลองใหม่');
    this.accept(session);
    this.notice.set('');
    this.logoutPending.set(false);
    this.pendingLogoutToken = undefined;
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (!this.canRefresh()) {
      this.expire();
      return Promise.reject(new AuthApiError('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 401));
    }
    const generation = this.generation;
    return this.refreshing = this.gateway.refresh().then(session => {
      if (generation !== this.generation) throw new Error('Session เปลี่ยนแล้ว กรุณาลองใหม่');
      this.accept(session);
    }).catch(error => {
      if (generation === this.generation) {
        this.notice.set(error instanceof Error ? error.message : 'ต่ออายุไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
        this.expire(this.notice());
      }
      throw error;
    }).finally(() => { this.refreshing = undefined; });
  }
  async ensureSession(): Promise<boolean> {
    await this.restoreSession();
    let session = this.state();
    if (!session || this.logoutPending()) return false;
    if (session.sessionExpiresAt <= Date.now()) { this.expire(); return false; }
    try {
      if (session.accessExpiresAt <= Date.now()) {
        if (!this.canRefresh()) { this.expire(); return false; }
        await this.refresh();
      }
      if (this.gateway.me) {
        const user = await this.gateway.me();
        session = this.state();
        if (session) this.state.set({ ...session, user });
      }
      return !!this.state();
    } catch (error) { this.notice.set(error instanceof Error ? error.message : 'ตรวจสอบ Session ไม่สำเร็จ'); return false; }
  }
  async logout(): Promise<void> {
    this.generation++;
    this.pendingLogoutToken ??= this.accessToken();
    this.logoutPending.set(true);
    clearTimeout(this.timer);
    // Keep the Bearer privately for retry if network logout fails, including non-remembered sessions.
    this.state.set(null);
    try {
      await this.gateway.logout(this.pendingLogoutToken);
      this.notice.set('ออกจากระบบเรียบร้อยแล้ว');
      this.logoutPending.set(false);
      this.pendingLogoutToken = undefined;
    } catch {
      this.notice.set('ยังยืนยันการออกจากระบบกับเซิร์ฟเวอร์ไม่ได้ กรุณากดลองออกจากระบบอีกครั้ง');
    }
    await this.router.navigateByUrl('/login');
  }
  expire(message = 'Session หมดอายุหรือถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่'): void {
    this.generation++;
    this.accept(null);
    this.notice.set(message);
    void this.router.navigateByUrl('/login');
  }
  home(): string { return this.state()?.user.role === 'admin' ? '/admin' : '/user'; }
  private accept(session: AuthSession | null): void {
    clearTimeout(this.timer);
    this.state.set(session);
    if (!session) return;
    // Remembered sessions refresh on ACCESS_EXPIRED requests, without idle rotation loops.
    const deadline = session.rememberMe ? session.sessionExpiresAt : Math.min(session.accessExpiresAt, session.sessionExpiresAt);
    const schedule = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) this.expire();
      else this.timer = setTimeout(schedule, Math.min(remaining + 20, 2_147_483_647));
    };
    schedule();
  }
}
