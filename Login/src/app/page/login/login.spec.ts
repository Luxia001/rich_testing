import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../core/auth/auth.service';

describe('Login reactive form', () => {
  let component: Login;
  let auth: { login: jasmine.Spy; home: jasmine.Spy; notice: () => string };
  let router: { navigateByUrl: jasmine.Spy };

  beforeEach(async () => {
    auth = { login: jasmine.createSpy().and.resolveTo(), home: jasmine.createSpy().and.returnValue('/user'), notice: () => '' };
    router = { navigateByUrl: jasmine.createSpy().and.resolveTo(true) };
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    component = TestBed.createComponent(Login).componentInstance;
  });

  it('rejects missing or invalid email and missing password', async () => {
    await component.submit();
    expect(component.emailField.touched).toBeTrue();
    expect(component.passwordField.touched).toBeTrue();
    component.loginForm.patchValue({ email: 'invalid', password: 'Demo123!' });
    await component.submit();
    expect(component.emailField.hasError('email')).toBeTrue();
    expect(auth.login).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates to the role dashboard', async () => {
    component.loginForm.setValue({ email: 'user@rich.demo', password: 'Demo123!', rememberMe: true });
    await component.submit();
    expect(auth.login).toHaveBeenCalledOnceWith('user@rich.demo', 'Demo123!', true);
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/user');
    expect(component.passwordField.value).toBe('');
    expect(component.loading).toBeFalse();
    expect(component.loginForm.enabled).toBeTrue();
  });

  it('shows login errors and enables the form for retry', async () => {
    auth.login.and.rejectWith(new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'));
    component.loginForm.patchValue({ email: 'user@rich.demo', password: 'wrong' });
    await component.submit();
    expect(component.message).toContain('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(component.loginForm.enabled).toBeTrue();
    expect(component.loading).toBeFalse();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions while waiting', async () => {
    let finish!: () => void;
    auth.login.and.returnValue(new Promise<void>(resolve => finish = resolve));
    component.loginForm.patchValue({ email: 'admin@rich.demo', password: 'Demo123!' });
    auth.home.and.returnValue('/admin');
    const pending = component.submit();
    expect(component.loginForm.disabled).toBeTrue();
    await component.submit();
    expect(auth.login).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });
});
