import { TestBed } from '@angular/core/testing';
import { AuthTabs } from './auth-tabs.service';
import { AuthSession } from './auth.models';

describe('AuthTabs', () => {
  let tabs: AuthTabs;
  let peer: BroadcastChannel;
  const session = (): AuthSession => ({ user: { id: 'tab-test', email: 'user@rich.demo', displayName: 'User', role: 'user' }, accessToken: 'in-memory-only', rememberMe: false, accessExpiresAt: Date.now() + 60000, sessionExpiresAt: Date.now() + 60000 });
  beforeEach(() => { TestBed.configureTestingModule({}); tabs = TestBed.inject(AuthTabs); peer = new BroadcastChannel('rich.auth.v1'); });
  afterEach(() => peer.close());
  it('restores a non-remembered session from an existing tab', async () => {
    const original = session();
    peer.onmessage = ({ data }) => { if (data.type === 'request') peer.postMessage({ type: 'response', id: data.id, session: original }); };
    expect(await tabs.requestSession()).toEqual(original);
  });
  it('shares the current in-memory token with a requesting tab', async () => {
    const original = session();
    tabs.connect(() => original, () => {});
    const response = new Promise<any>(resolve => { peer.onmessage = event => resolve(event.data); });
    peer.postMessage({ type: 'request', id: 'new-tab' });
    expect((await response).session.accessToken).toBe('in-memory-only');
  });
  it('propagates logout from another tab', async () => {
    const loggedOut = new Promise<void>(resolve => tabs.connect(() => null, resolve));
    peer.postMessage({ type: 'logout' });
    await loggedOut;
    expect(true).toBeTrue();
  });
});
