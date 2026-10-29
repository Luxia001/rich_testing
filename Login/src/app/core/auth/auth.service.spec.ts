import { AuthTabs } from './auth-tabs.service';
import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
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
});

