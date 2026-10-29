import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!request.url.startsWith('/api/')) return next(request);
  return next(request.clone({ withCredentials: true })).pipe(catchError(error => {
    const authEndpoint = /^\/api\/auth\/(login|me|logout)(\?|$)/.test(request.url);
    if (!authEndpoint && error instanceof HttpErrorResponse) {
      if (error.status === 401) auth.expire();
      else if (error.status === 403) void router.navigateByUrl('/forbidden');
    }
    return throwError(() => error);
  }));
};
