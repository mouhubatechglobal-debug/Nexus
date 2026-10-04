import { useEffect } from 'react';
import { AppShell } from './layout/AppShell';
import { AuthScreen } from './components/AuthScreen';
import { AuthProvider, useAuth } from './lib/auth';
import { ROUTES } from './routes';
import { useHashRoute } from './router';

function RoutedApp() {
  const { user, loading } = useAuth();
  const path = useHashRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0]!;

  useEffect(() => {
    if (user) {
      document.title = `${route.label} · Nexus — Digital Creation OS`;
    }
  }, [route, user]);

  if (loading) {
    return (
      <main className="auth-screen">
        <p className="muted">Connexion à NEXUS…</p>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <AppShell route={route}>{route.element}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <RoutedApp />
    </AuthProvider>
  );
}
