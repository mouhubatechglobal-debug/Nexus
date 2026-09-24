import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, type AuthUser, type Organization } from './api';

/**
 * Session courante : cookie HttpOnly côté navigateur (jamais de jeton
 * en localStorage). Le contexte expose l'utilisateur et son organisation
 * active (première organisation du compte).
 */
interface AuthContextValue {
  user: AuthUser | null;
  organization: Organization | null;
  organizations: Organization[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName?: string; organizationName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshOrganizations = useCallback(async () => {
    try {
      setOrganizations(await api.organizations());
    } catch {
      setOrganizations([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(async (me) => {
        if (cancelled) return;
        setUser(me);
        await refreshOrganizations();
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshOrganizations]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organizations,
      organization: organizations[0] ?? null,
      loading,
      async login(email, password) {
        const response = await api.login(email, password);
        setUser(response.user);
        await refreshOrganizations();
      },
      async register(input) {
        const response = await api.register(input);
        setUser(response.user);
        await refreshOrganizations();
      },
      async logout() {
        await api.logout();
        setUser(null);
        setOrganizations([]);
      },
      refreshOrganizations,
    }),
    [user, organizations, loading, refreshOrganizations],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}
