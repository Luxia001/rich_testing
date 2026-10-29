import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { roleGuard } from './auth.guard';

describe('roleGuard restore timing', () => {
  it('waits for restored session before checking role in a new tab', async () => {
    let restored = false;
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { restoreSession: async () => { await Promise.resolve(); restored = true; }, session: () => restored ? { user: { role: 'user' } } : null } },
      { provide: Router, useValue: { createUrlTree: jasmine.createSpy().and.returnValue('forbidden') } },
    ] });
    const result = TestBed.runInInjectionContext(() => roleGuard({ data: { role: 'user' } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(await result).toBeTrue();
  });
});
