import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly loginForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [false],
  });
  readonly emailField = this.loginForm.controls.email;
  readonly passwordField = this.loginForm.controls.password;
  showPassword = false;
  submitted = false;
  message = '';
  loading = false;

  async retryLogout(): Promise<void> {
    this.loading = true;
    try { await this.auth.logout(); } finally { this.loading = false; }
  }
  async submit(): Promise<void> {
    if (this.loading) return;
    this.submitted = true;
    this.message = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password, rememberMe } = this.loginForm.getRawValue();
    this.loading = true;
    this.loginForm.disable({ emitEvent: false });
    try {
      await this.auth.login(email.trim(), password, rememberMe);
      this.passwordField.reset('');
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      const home = this.auth.home();
      await this.router.navigateByUrl(requested === home ? requested : home);
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';
    } finally {
      this.loginForm.enable({ emitEvent: false });
      this.loading = false;
    }
  }
}

