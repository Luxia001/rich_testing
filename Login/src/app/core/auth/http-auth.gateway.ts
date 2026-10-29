import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthGateway, AuthSession, AuthUser } from './auth.models';

interface SessionResponse { user: AuthUser; expiresAt: string; rememberMe: boolean; }
export interface AdminSession {
  id: string; email: string; rememberMe: boolean; createdAt: string;
  expiresAt: string; revokedAt: string | null;
}
export class AuthApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function apiError(error: unknown): AuthApiError {
  if (error instanceof AuthApiError) return error;
  if (error instanceof HttpErrorResponse) {
    const messages: Record<number, string> = {
      0: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบ Backend และลองใหม่',
      400: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีเมลและรหัสผ่าน',
      401: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือ Session หมดอายุ',
      403: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
      429: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    };
    return new AuthApiError(messages[error.status] ?? 'เซิร์ฟเวอร์ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', error.status);
  }
  return new AuthApiError('ไม่สามารถดำเนินการได้ กรุณาลองใหม่', -1);
}

@Injectable({ providedIn: 'root' })
export class HttpAuthGateway implements AuthGateway {
  private http = inject(HttpClient);

  async login(email: string, password: string, rememberMe: boolean): Promise<AuthSession> {
    return this.request(this.http.post<SessionResponse>('/api/auth/login', {
      email: email.trim().toLowerCase(), password, rememberMe,
    }, { withCredentials: true }));
  }
  async restore(): Promise<AuthSession | null> {
    try { return await this.refresh(); }
    catch (error) {
      if (error instanceof AuthApiError && error.status === 401) return null;
      throw error;
    }
  }
  // Current API uses a cookie session. This checks /me; it does not issue a new token.
  async refresh(): Promise<AuthSession> {
    return this.request(this.http.get<SessionResponse>('/api/auth/me', { withCredentials: true }));
  }
  async logout(): Promise<void> {
    try { await firstValueFrom(this.http.post<void>('/api/auth/logout', {}, { withCredentials: true })); }
    catch (error) { throw apiError(error); }
  }
  async adminSessions(): Promise<AdminSession[]> {
    try {
      const response = await firstValueFrom(this.http.get<{ sessions: AdminSession[] }>('/api/admin/sessions', { withCredentials: true }));
      return response.sessions;
    } catch (error) { throw apiError(error); }
  }
  private async request(response: import('rxjs').Observable<SessionResponse>): Promise<AuthSession> {
    try {
      const result = await firstValueFrom(response);
      const expiresAt = Date.parse(result.expiresAt);
      if (!result.user || !['user', 'admin'].includes(result.user.role) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new AuthApiError('ข้อมูล Session จากเซิร์ฟเวอร์ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่', 401);
      }
      return { user: result.user, rememberMe: result.rememberMe, accessExpiresAt: expiresAt, sessionExpiresAt: expiresAt };
    } catch (error) { throw apiError(error); }
  }
}
