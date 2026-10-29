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
  private restoration?: Promise<void>;
  private refreshing?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;

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
    if (generation !== this.generation) return;
    this.accept(session);
    this.notice.set('');
    this.logoutPending.set(false);
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    return this.refreshing = this.gateway.refresh().then(session => {
      if (generation === this.generation) this.accept(session);
    }).catch(error => {
      if (generation === this.generation && error instanceof AuthApiError && error.status === 401) this.expire();
      throw error;
    }).finally(() => { this.refreshing = undefined; });
  }
  async ensureSession(): Promise<boolean> {
    await this.restoreSession();
    if (!this.state()) return false;
    if (this.state()!.sessionExpiresAt <= Date.now()) { this.expire(); return false; }
    try { await this.refresh(); return !!this.state(); }
    catch (error) { this.notice.set(error instanceof Error ? error.message : 'ตรวจสอบ Session ไม่สำเร็จ'); return false; }
  }
  async logout(): Promise<void> {
    this.generation++;
    this.accept(null);
    try {
      await this.gateway.logout();
      this.notice.set('ออกจากระบบเรียบร้อยแล้ว');
      this.logoutPending.set(false);
    } catch {
      this.notice.set('ยังยืนยันการออกจากระบบกับเซิร์ฟเวอร์ไม่ได้ กรุณากดลองออกจากระบบอีกครั้ง');
      this.logoutPending.set(true);
    }
    await this.router.navigateByUrl('/login');
  }
  expire(): void {
    this.generation++;
    this.accept(null);
    this.notice.set('Session หมดอายุหรือถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่');
    void this.router.navigateByUrl('/login');
  }
  home(): string { return this.state()?.user.role === 'admin' ? '/admin' : '/user'; }
  private accept(session: AuthSession | null): void {
    clearTimeout(this.timer);
    this.state.set(session);
    if (session) {
      // Browsers cap setTimeout at a signed 32-bit integer; long remembered sessions need chunks.
      const schedule = () => {
        const remaining = session.sessionExpiresAt - Date.now();
        if (remaining <= 0) this.expire();
        else this.timer = setTimeout(schedule, Math.min(remaining + 20, 2_147_483_647));
      };
      schedule();
    }
  }
}
