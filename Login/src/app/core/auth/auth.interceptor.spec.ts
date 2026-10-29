import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('Bearer and refresh interceptor', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  let token: string;
  let auth: any;
  let router: { navigateByUrl: jasmine.Spy };
  beforeEach(() => {
    token = 'old-token';
    auth = {
      accessToken: () => token, session: () => ({ user: { id: '1' } }),
      sessionVersion: () => 0,
      canRefresh: () => true, expire: jasmine.createSpy(),
      refresh: jasmine.createSpy().and.callFake(async () => { token = 'new-token'; }),
    };
    router = { navigateByUrl: jasmine.createSpy().and.resolveTo(true) };
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
  });
  afterEach(() => requests.verify());
  it('attaches Bearer only to own protected API', async () => {
    const own = firstValueFrom(http.get('/api/auth/me'));
    const external = firstValueFrom(http.get('https://example.com/data'));
    const request = requests.expectOne('/api/auth/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer old-token');
    request.flush({ user: {} });
    const other = requests.expectOne('https://example.com/data');
    expect(other.request.headers.has('Authorization')).toBeFalse();
    expect(other.request.withCredentials).toBeFalse();
    other.flush({}); await Promise.all([own, external]);
  });
  it('refreshes ACCESS_EXPIRED and retries exactly once', async () => {
    const pending = firstValueFrom(http.get('/api/data')).catch(error => error);
    requests.expectOne('/api/data').flush({ error: { code: 'ACCESS_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });
    await Promise.resolve(); await Promise.resolve();
    const retry = requests.expectOne('/api/data');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ error: { code: 'ACCESS_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.expire).toHaveBeenCalledTimes(1);
  });
  it('does not refresh 403 or revoked sessions', async () => {
    const forbidden = firstValueFrom(http.get('/api/admin/sessions')).catch(error => error);
    requests.expectOne('/api/admin/sessions').flush({}, { status: 403, statusText: 'Forbidden' });
    await forbidden;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/forbidden');
    const revoked = firstValueFrom(http.get('/api/data')).catch(error => error);
    requests.expectOne('/api/data').flush({ error: { code: 'SESSION_REVOKED' } }, { status: 401, statusText: 'Unauthorized' });
    await revoked;
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.expire).toHaveBeenCalled();
  });
  it('does not refresh login, refresh or logout failures', async () => {
    for (const action of ['login', 'refresh', 'logout']) {
      const pending = firstValueFrom(http.post('/api/auth/' + action, {})).catch(error => error);
      const request = requests.expectOne('/api/auth/' + action);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ error: { code: 'ACCESS_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });
      await pending;
    }
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.expire).not.toHaveBeenCalled();
  });
  it('does not auto-refresh non-remembered sessions', async () => {
    auth.canRefresh = () => false;
    const pending = firstValueFrom(http.get('/api/data')).catch(error => error);
    requests.expectOne('/api/data').flush({ error: { code: 'ACCESS_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(auth.refresh).not.toHaveBeenCalled(); expect(auth.expire).toHaveBeenCalled();
  });
});
