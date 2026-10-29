import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthGateway, AuthSession, AuthUser } from './auth.models';

interface SessionResponse { user: AuthUser; accessToken: string; accessExpiresAt: string; sessionExpiresAt: string; }
export interface AdminSession {
  id: string; email: string; rememberMe: boolean; createdAt: string;
  expiresAt: string; revokedAt: string | null;
}
export class AuthApiError extends Error {
  constructor(message: string, readonly status: number, readonly code = '') { super(message); }
}
export function apiError(error: unknown): AuthApiError {
  if (error instanceof AuthApiError) return error;
  if (error instanceof HttpErrorResponse) {
    const code = typeof error.error?.error?.code === 'string' ? error.error.error.code : '';
    const byCode: Record<string, string> = {
      INVALID_CREDENTIALS: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      ACCESS_EXPIRED: 'Access Token หมดอายุ',
      SESSION_REVOKED: 'Session หมดอายุหรือถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่',
      REFRESH_INVALID: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
      REFRESH_REUSED: 'Session ถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่',
    };
    const messages: Record<number, string> = {
      0: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบ Backend และลองใหม่',
      400: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีเมลและรหัสผ่าน',
      401: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือ Session หมดอายุ',
      403: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
      429: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    };
    return new AuthApiError(byCode[code] ?? messages[error.status] ?? 'เซิร์ฟเวอร์ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', error.status, code);
  }
  return new AuthApiError('ไม่สามารถดำเนินการได้ กรุณาลองใหม่', -1);
}

@Injectable({ providedIn: 'root' })
export class HttpAuthGateway implements AuthGateway {
  private http = inject(HttpClient);

  async login(email: string, password: string, rememberMe: boolean): Promise<AuthSession> {
    return this.request(this.http.post<SessionResponse>('/api/auth/login', {
      email: email.trim().toLowerCase(), password, rememberMe,
    }, { withCredentials: true }), rememberMe);
  }
  async restore(): Promise<AuthSession | null> {
    try { return await this.refresh(); }
    catch (error) {
      if (error instanceof AuthApiError && error.status === 401) return null;
      throw error;
    }
  }
  // Refresh cookie is HttpOnly. Access tokens remain in AuthService memory.
  async refresh(): Promise<AuthSession> {
    return this.request(this.http.post<SessionResponse>('/api/auth/refresh', {}, { withCredentials: true }), true);
  }
  async logout(accessToken?: string): Promise<void> {
    try { await firstValueFrom(this.http.post<void>('/api/auth/logout', {}, { withCredentials: true, headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : {} })); }
    catch (error) { throw apiError(error); }
  }
  async me(): Promise<AuthUser> {
    try { return (await firstValueFrom(this.http.get<{ user: AuthUser }>('/api/auth/me'))).user; }
    catch (error) { throw apiError(error); }
  }
  async adminSessions(): Promise<AdminSession[]> {
    try {
      const response = await firstValueFrom(this.http.get<{ sessions: AdminSession[] }>('/api/admin/sessions', { withCredentials: true }));
      return response.sessions;
    } catch (error) { throw apiError(error); }
  }
  private async request(response: import('rxjs').Observable<SessionResponse>, rememberMe: boolean): Promise<AuthSession> {
    try {
      const result = await firstValueFrom(response);
      const accessExpiresAt = Date.parse(result.accessExpiresAt);
      const sessionExpiresAt = Date.parse(result.sessionExpiresAt);
      if (!result.user || !['user', 'admin'].includes(result.user.role) || typeof result.accessToken !== 'string' || !result.accessToken || !Number.isFinite(accessExpiresAt) || !Number.isFinite(sessionExpiresAt) || accessExpiresAt <= Date.now() || sessionExpiresAt < accessExpiresAt) {
        throw new AuthApiError('ข้อมูล Session จากเซิร์ฟเวอร์ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่', 401);
      }
      return { user: result.user, accessToken: result.accessToken, rememberMe, accessExpiresAt, sessionExpiresAt };
    } catch (error) { throw apiError(error); }
  }
}

