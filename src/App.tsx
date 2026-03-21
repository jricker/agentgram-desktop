import { useEffect } from "react";
import { useAuthStore } from "./stores/authStore";
import { LoginScreen } from "./components/LoginScreen";
import { Dashboard } from "./components/Dashboard";

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

export default App;
