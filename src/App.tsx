import { useEffect, Component, type ReactNode } from "react";
import { useAuthStore } from "./stores/authStore";
import { LoginScreen } from "./components/LoginScreen";
import { Dashboard } from "./components/Dashboard";

// Global error boundary to prevent white-screen crashes
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen w-screen bg-background p-8">
          <div className="max-w-md text-center space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <pre className="text-xs text-destructive bg-destructive/10 p-4 rounded-lg overflow-auto max-h-[200px] text-left">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { token, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();

    const handleExpired = () => {
      useAuthStore.getState().logout();
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [restoreSession]);

  if (!token) {
    return <LoginScreen />;
  }

  return <Dashboard />;
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
