import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApiError, HttpAuthGateway } from './http-auth.gateway';

describe('HttpAuthGateway', () => {
  let gateway: HttpAuthGateway;
  let http: HttpTestingController;
  const response = () => ({ user: { id: '1', email: 'user@rich.demo', displayName: 'User', role: 'user' }, expiresAt: new Date(Date.now() + 60000).toISOString(), rememberMe: true });
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    gateway = TestBed.inject(HttpAuthGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('posts normalized credentials with cookies', async () => {
    const pending = gateway.login(' USER@rich.demo ', 'password', true);
    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.body).toEqual({ email: 'user@rich.demo', password: 'password', rememberMe: true });
    request.flush(response());
    expect((await pending).user.role).toBe('user');
  });
  it('restores from /me without tokens in storage', async () => {
    const pending = gateway.restore();
    http.expectOne('/api/auth/me').flush(response());
    expect((await pending)?.rememberMe).toBeTrue();
  });
  it('treats unauthenticated restore as guest', async () => {
    const pending = gateway.restore();
    http.expectOne('/api/auth/me').flush({ error: 'Authentication required' }, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBeNull();
  });
  it('keeps network errors distinct from wrong credentials', async () => {
    const pending = gateway.login('user@rich.demo', 'wrong', false);
    const result = pending.catch(error => error as AuthApiError);
    http.expectOne('/api/auth/login').error(new ProgressEvent('error'));
    expect((await result as AuthApiError).status).toBe(0);
  });
  it('posts logout with cookies', async () => {
    const pending = gateway.logout();
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBeTrue();
    request.flush(null, { status: 204, statusText: 'No Content' });
    await pending;
  });
});
