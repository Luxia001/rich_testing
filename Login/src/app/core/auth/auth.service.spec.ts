import { AuthTabs } from './auth-tabs.service';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AUTH_GATEWAY, AuthService } from './auth.service';
import { AuthSession } from './auth.models';

describe('AuthService token lifecycle', () => {
  let auth: AuthService;
  let gateway: any;
  const session = (rememberMe = true): AuthSession => ({ user: { id: '1', email: 'user@rich.demo', displayName: 'User', role: 'user' }, accessToken: 'access', rememberMe, accessExpiresAt: Date.now() + 60000, sessionExpiresAt: Date.now() + (rememberMe ? 300000 : 60000) });
  beforeEach(() => {
    gateway = { restore: jasmine.createSpy().and.resolveTo(null), login: jasmine.createSpy().and.callFake(async (_e: string, _p: string, remember: boolean) => session(remember)), refresh: jasmine.createSpy().and.callFake(async () => session()), logout: jasmine.createSpy().and.resolveTo() };
    TestBed.configureTestingModule({ providers: [{ provide: AuthTabs, useValue: { connect: () => {}, requestSession: () => Promise.resolve(null), exclusive: (work: () => Promise<unknown>) => work(), logout: () => {} } }, { provide: AUTH_GATEWAY, useValue: gateway }, { provide: Router, useValue: { navigateByUrl: jasmine.createSpy().and.resolveTo(true) } }] });
    auth = TestBed.inject(AuthService);
  });
  it('shares one refresh across concurrent requests', async () => {
    await auth.login('a', 'b', true);
    await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
    await auth.logout();
  });
  it('preserves Bearer for logout retry even without Remember Me', async () => {
    await auth.login('a', 'b', false);
    gateway.logout.and.rejectWith(new Error('offline'));
    await auth.logout();
    expect(gateway.logout).toHaveBeenCalledWith('access');
    expect(auth.session()).toBeNull(); expect(auth.logoutPending()).toBeTrue();
    gateway.logout.and.resolveTo();
    await auth.logout();
    expect(gateway.logout.calls.mostRecent().args).toEqual(['access']);
    expect(auth.logoutPending()).toBeFalse();
  });
  it('expires non-remembered sessions without refresh', fakeAsync(() => {
    void auth.login('a', 'b', false); tick();
    tick(60021);
    expect(auth.session()).toBeNull(); expect(gateway.refresh).not.toHaveBeenCalled();
  }));
  it('clears state if refresh fails without retry loops', async () => {
    await auth.login('a', 'b', true);
    gateway.refresh.and.rejectWith(new Error('offline'));
    await auth.refresh().catch(() => {});
    expect(auth.session()).toBeNull(); expect(gateway.refresh).toHaveBeenCalledTimes(1);
  });
  it('automatically refreshes at 60 seconds and expires at the original 90-second deadline', fakeAsync(() => {
    const start = Date.now();
    const initial = { ...session(true), accessExpiresAt: start + 60000, sessionExpiresAt: start + 90000 };
    gateway.login.and.resolveTo(initial);
    gateway.refresh.and.callFake(async () => ({ ...initial, accessToken: 'rotated', accessExpiresAt: initial.sessionExpiresAt }));
    void auth.login('a', 'b', true); tick();
    tick(60021);
    expect(gateway.login).toHaveBeenCalledTimes(1);
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
    expect(auth.accessToken()).toBe('rotated');
    expect(auth.session()?.sessionExpiresAt).toBe(start + 90000);
    expect(auth.renewing()).toBeFalse();
    tick(30000);
    expect(auth.session()).toBeNull();
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
  }));
  it('does not loop when scheduled refresh fails', fakeAsync(() => {
    gateway.refresh.and.rejectWith(new Error('refresh expired'));
    void auth.login('a', 'b', true); tick();
    tick(60021);
    expect(auth.session()).toBeNull();
    expect(auth.renewing()).toBeFalse();
    tick(300000);
    expect(gateway.refresh).toHaveBeenCalledTimes(1);
  }));
  it('cancels scheduled refresh on logout', fakeAsync(() => {
    void auth.login('a', 'b', true); tick();
    void auth.logout(); tick();
    tick(60021);
    expect(gateway.refresh).not.toHaveBeenCalled();
    expect(auth.session()).toBeNull();
  }));
});

