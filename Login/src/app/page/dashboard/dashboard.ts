import { Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminSession, HttpAuthGateway } from '../../core/auth/http-auth.gateway';

@Component({ selector: 'app-dashboard', imports: [DatePipe, RouterLink], templateUrl: './dashboard.html', styleUrl: './dashboard.css' })
export class Dashboard implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private api = inject(HttpAuthGateway);
  readonly now = signal(Date.now());
  sessions: AdminSession[] = [];
  busy = false;
  loadingSessions = false;
  sessionsError = '';
  message = '';
  private ticker = setInterval(() => this.now.set(Date.now()), 1000);
  ngOnInit(): void { if (this.auth.session()?.user.role === 'admin') void this.loadSessions(); }
  remainingDate(expires: string): boolean { return Date.parse(expires) > this.now(); }
  remaining(expires: number): number { return Math.max(0, Math.ceil((expires - this.now()) / 1000)); }
  async loadSessions(): Promise<void> {
    if (this.loadingSessions) return;
    this.loadingSessions = true; this.sessionsError = '';
    try { this.sessions = await this.api.adminSessions(); }
    catch (error) { this.sessionsError = error instanceof Error ? error.message : 'โหลดรายการไม่สำเร็จ'; }
    finally { this.loadingSessions = false; }
  }
  async refresh(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.message = '';
    try { await this.auth.ensureSession(); this.message = this.auth.session() ? 'ตรวจสอบ Session กับเซิร์ฟเวอร์แล้ว' : 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'; }
    catch (error) { this.message = error instanceof Error ? error.message : 'ตรวจสอบ Session ไม่สำเร็จ'; }
    finally { this.busy = false; }
  }
  async logout(): Promise<void> { if (this.busy) return; this.busy = true; try { await this.auth.logout(); } finally { this.busy = false; } }
  ngOnDestroy(): void { clearInterval(this.ticker); }
}


