import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return await auth.ensureSession() || router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url.split('?')[0] },
  });
};
export const roleGuard: CanActivateFn = async route => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restoreSession();
  return auth.session()?.user.role === route.data['role'] || router.createUrlTree(['/forbidden']);
};
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return await auth.ensureSession() ? router.parseUrl(auth.home()) : true;
};
