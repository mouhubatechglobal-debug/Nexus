import { useEffect } from 'react';
import { AppShell } from './layout/AppShell';
import { ROUTES } from './routes';
import { useHashRoute } from './router';

export default function App() {
  const path = useHashRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0]!;

  useEffect(() => {
    document.title = `${route.label} · Nexus — Digital Creation OS`;
  }, [route]);

  return (
    <AppShell route={route}>
      {route.element}
    </AppShell>
  );
}
