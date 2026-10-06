import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, onUnauthorized, refreshAccessToken, tokenStore } from './api';
import type { AuthUser, Tokens } from '@/types';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** True when the role holds the permission. Super admins hold everything. */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const SUPER_ADMIN = 'super_admin';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!tokenStore.access && !tokenStore.refresh) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const me = await api.get<AuthUser>('/api/v1/auth/me');
      setUser(me);
    } catch {
      // A failed refresh has already cleared the tokens and notified listeners.
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  // The API client owns token lifetime; when a refresh fails it calls this so
  // the UI drops the session instead of rendering an authenticated shell with
  // failing requests behind it.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        setIsLoading(false);
      }),
    [],
  );

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ user: AuthUser; tokens: Tokens }>('/api/v1/auth/login', {
      username,
      password,
    });
    tokenStore.set(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    setUser(null);
    if (!refreshToken) return;
    // Best effort: the local session is already gone, so a failure here (an
    // expired refresh token, an offline server) must not block sign-out.
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenStore.access ?? ''}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* ignored */
    }
  }, []);

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === SUPER_ADMIN) return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser: loadUser,
      can,
    }),
    [user, isLoading, login, logout, loadUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/**
 * Re-exported so pages can retry a refresh explicitly after a network blip,
 * without reaching into the API client.
 */
export { refreshAccessToken };