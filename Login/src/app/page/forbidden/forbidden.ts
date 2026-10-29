import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
@Component({
  selector: 'app-forbidden', imports: [RouterLink],
  template: `<main><span>403 / ACCESS RESTRICTED</span><h1>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</h1><p>บัญชีปัจจุบันไม่มีบทบาทที่จำเป็นสำหรับหน้านี้</p><a [routerLink]="auth.home()">กลับ Dashboard →</a></main>`,
  styles: [`main { max-width: 650px; margin: 15vh auto; padding: 36px; } span { color: var(--color-muted); font-size: 12px; letter-spacing: 2px; } h1 { font-size: 30px; font-weight: 500; } p { color: var(--color-muted); } a { color: var(--color-text); display: inline-block; margin-top: 20px; background: var(--color-accent); padding: 12px 20px; border-radius: 6px; text-decoration: none; }`],
})
export class Forbidden { readonly auth = inject(AuthService); }

