import { AuthTabs } from './core/auth/auth-tabs.service';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AUTH_GATEWAY } from './core/auth/auth.service';

describe('App', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [App], providers: [provideRouter([]), { provide: AuthTabs, useValue: { connect: () => {}, requestSession: () => Promise.resolve(null), exclusive: (work: () => Promise<unknown>) => work(), logout: () => {} } }, {
      provide: AUTH_GATEWAY, useValue: { restore: () => Promise.resolve(null) },
    }],
  }));
  it('waits for restore before rendering the router outlet', fakeAsync(() => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Session');
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  }));
});

