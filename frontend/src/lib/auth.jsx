import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { api, onUnauthorized, refreshAccessToken, tokenStore } from "./api.js";
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadUser = useCallback(async () => {
    if (!tokenStore.access && !tokenStore.refresh) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const me = await api.get("/api/v1/auth/me");
      setUser(me);
    } catch (error) {
      const err = error;
      if (err?.status === 401) {
        tokenStore.clear();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadUser();
  }, [loadUser]);
  useEffect(
    () => onUnauthorized(() => {
      setUser(null);
      setIsLoading(false);
    }),
    []
  );
  const login = useCallback(async (username, password) => {
    const result = await api.post("/api/v1/auth/login", {
      username,
      password
    });
    tokenStore.set(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);
  const logout = useCallback(async () => {
    const accessToken = tokenStore.access;
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    setUser(null);
    if (!refreshToken) return;
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken ?? ""}`
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch {
    }
  }, []);
  const can = useCallback(
    (permission) => {
      if (!user) return false;
      // Permissions come from the role map in backend
      // src/shared/types/permissions.js, recomputed on every request. No role
      // is hardcoded as all-powerful here: super_admin is read-only for
      // operational data, like admin, and can only be changed in that map.
      return user.permissions.includes(permission);
    },
    [user]
  );
  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser: loadUser,
      can
    }),
    [user, isLoading, login, logout, loadUser, can]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
export {
  AuthProvider,
  refreshAccessToken,
  useAuth
};
