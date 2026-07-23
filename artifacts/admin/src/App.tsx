import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { SidebarProvider } from '@/components/ui/sidebar';

import { useEffect } from 'react';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { Shell } from '@/components/layout/Shell';
import Login from '@/pages/login';

import { routes } from '@/pages/routes';

const queryClient = new QueryClient();

// A wrapper to protect routes
function ProtectedRoute({ component: Component }: { component: any }) {
  const { data: user, isLoading, error } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() }});
  const [, setLocation] = useLocation();

  // Redirect to login after render — never call setLocation during render
  useEffect(() => {
    if (!isLoading && (error || !user)) {
      setLocation('/login');
    }
  }, [isLoading, error, user, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (error || !user) {
    return null; // useEffect above will redirect
  }

  return <Component />;
}

// Convert elements from routes list back to components inside ProtectedRoute
function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Protected Routes wrapped in Shell */}
      <Route path="*">
        <SidebarProvider>
          <Shell>
            <Switch>
              {routes.map(r => (
                <Route key={r.path} path={r.path}>
                  <ProtectedRoute component={r.component} />
                </Route>
              ))}
              <Route component={NotFound} />
            </Switch>
          </Shell>
        </SidebarProvider>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;