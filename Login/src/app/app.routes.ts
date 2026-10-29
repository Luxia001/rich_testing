import { Routes } from '@angular/router';
import { Login } from './page/login/login';
import { authGuard, guestGuard, roleGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login, canActivate: [guestGuard] },
  { path: 'user', loadComponent: () => import('./page/dashboard/dashboard').then(m => m.Dashboard), canActivate: [authGuard, roleGuard], data: { role: 'user' } },
  { path: 'admin', loadComponent: () => import('./page/dashboard/dashboard').then(m => m.Dashboard), canActivate: [authGuard, roleGuard], data: { role: 'admin' } },
  { path: 'forbidden', loadComponent: () => import('./page/forbidden/forbidden').then(m => m.Forbidden), canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' },
];
