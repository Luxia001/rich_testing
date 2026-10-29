import { DestroyRef, inject, Injectable } from '@angular/core';
import { AuthSession } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthTabs {
  private channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('rich.auth.v1') : undefined;
  private readers = new Map<string, (session: AuthSession | null) => void>();
  private read: () => AuthSession | null = () => null;
  private signedOut: () => void = () => {};

  constructor() {
    if (this.channel) this.channel.onmessage = ({ data }) => {
      if (data?.type === 'request' && typeof data.id === 'string') {
        const session = this.read();
        if (session?.accessToken && session.sessionExpiresAt > Date.now() && session.accessExpiresAt > Date.now()) {
          this.channel?.postMessage({ type: 'response', id: data.id, session });
        }
      } else if (data?.type === 'response') {
        this.readers.get(data.id)?.(data.session);
      } else if (data?.type === 'logout') this.signedOut();
    };
    inject(DestroyRef).onDestroy(() => { this.channel?.close(); this.readers.forEach(resolve => resolve(null)); this.readers.clear(); });
  }
  connect(read: () => AuthSession | null, signedOut: () => void): void { this.read = read; this.signedOut = signedOut; }
  requestSession(): Promise<AuthSession | null> {
    if (!this.channel) return Promise.resolve(null);
    const id = crypto.randomUUID();
    return new Promise(resolve => {
      const timeout = setTimeout(() => done(null), 300);
      const done = (session: AuthSession | null) => {
        clearTimeout(timeout); this.readers.delete(id); resolve(session);
      };
      this.readers.set(id, done);
      this.channel!.postMessage({ type: 'request', id });
    });
  }
  logout(): void { this.channel?.postMessage({ type: 'logout' }); }
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('rich.auth.session', work);
    }
    return await work();
  }
}
