import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { MockAuthGateway } from './mock-auth.gateway';

describe('MockAuthGateway', () => {
  let gateway: MockAuthGateway;
  beforeEach(() => {
    localStorage.removeItem('rich.demo.session.v1');
    TestBed.configureTestingModule({});
    gateway = TestBed.inject(MockAuthGateway);
  });
  afterEach(() => localStorage.removeItem('rich.demo.session.v1'));

  it('rejects invalid credentials', fakeAsync(() => {
    let rejected = false;
    gateway.login('user@rich.demo', 'wrong', false).catch(() => rejected = true);
    tick(350);
    expect(rejected).toBeTrue();
  }));

  it('does not restore a non-remembered session', fakeAsync(() => {
    gateway.login('user@rich.demo', 'Demo123!', false);
    tick(350);
    let restored: unknown = 'pending';
    gateway.restore().then(value => restored = value);
    tick(350);
    expect(restored).toBeNull();
  }));

  it('restores remembered identity and keeps the original session deadline', fakeAsync(() => {
    let deadline = 0;
    gateway.login(' ADMIN@rich.demo ', 'Demo123!', true).then(value => deadline = value.sessionExpiresAt);
    tick(350);
    tick(1000);
    const reloaded = new MockAuthGateway();
    reloaded.restore().then(value => {
      expect(value?.user.role).toBe('admin');
      expect(value?.sessionExpiresAt).toBe(deadline);
    });
    tick(700);
    flushMicrotasks();
  }));

  it('clears remembered sessions on logout', fakeAsync(() => {
    gateway.login('user@rich.demo', 'Demo123!', true);
    tick(350);
    gateway.logout();
    tick(350);
    expect(localStorage.getItem('rich.demo.session.v1')).toBeNull();
  }));

  it('rejects refresh after the fixed expiry', fakeAsync(() => {
    gateway.login('user@rich.demo', 'Demo123!', true);
    tick(350);
    tick(300001);
    let rejected = false;
    gateway.refresh().catch(() => rejected = true);
    tick(350);
    expect(rejected).toBeTrue();
    expect(localStorage.getItem('rich.demo.session.v1')).toBeNull();
  }));
});
