export type Role = 'user' | 'admin';
export interface AuthUser { id: string; email: string; displayName: string; role: Role; }
export interface AuthSession {
  user: AuthUser;
  accessToken?: string;
  rememberMe: boolean;
  accessExpiresAt: number;
  sessionExpiresAt: number;
}
export interface AuthGateway {
  login(email: string, password: string, rememberMe: boolean): Promise<AuthSession>;
  restore(): Promise<AuthSession | null>;
  refresh(): Promise<AuthSession>;
  logout(accessToken?: string): Promise<void>;
  me?(): Promise<AuthUser>;
}

