import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const auth = inject(AuthService);
  const router = inject(Router);
  const isAuthAction = /^\/api\/auth\/(login|refresh|logout)(?:[/?]|$)/.test(request.url);
  const token = auth.accessToken();
  const version = auth.sessionVersion();
  const attach = (value?: string) => request.clone({
    withCredentials: true,
    ...(value ? { setHeaders: { Authorization: `Bearer ${value}` } } : {}),
  });
  const protectedRequest = !isAuthAction && !!token;
  return next(attach(isAuthAction ? undefined : token)).pipe(catchError(error => {
    if (isAuthAction || !(error instanceof HttpErrorResponse)) return throwError(() => error);
    if (error.status === 403) { void router.navigateByUrl('/forbidden'); return throwError(() => error); }
    if (error.status !== 401 || !protectedRequest) return throwError(() => error);
    // A response for a previous identity must not clear or retry the new login.
    if (!auth.session() || version !== auth.sessionVersion()) return throwError(() => error);
    const expired = error.error?.error?.code === 'ACCESS_EXPIRED';
    if (!expired || !auth.canRefresh()) { auth.expire(); return throwError(() => error); }
    // A concurrent request may have already rotated the token by the time this 401 arrives.
    const refreshed = auth.accessToken() !== token ? Promise.resolve() : auth.refresh();
    return from(refreshed).pipe(switchMap(() => next(attach(auth.accessToken())).pipe(catchError(retryError => {
      if (retryError instanceof HttpErrorResponse) {
        if (retryError.status === 401) auth.expire();
        else if (retryError.status === 403) void router.navigateByUrl('/forbidden');
      }
      return throwError(() => retryError);
    }))));
  }));
};
