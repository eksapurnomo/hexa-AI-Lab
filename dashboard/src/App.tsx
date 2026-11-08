import React, { useState, useEffect, useCallback } from "react";
import {
  DashboardModuleId,
  ColabStatusResponse,
  AuthenticatedUser,
} from "./types/colab";
import {
  UnslothTrainingConfig,
  DEFAULT_UNSLOTH_CONFIG,
} from "./types/unsloth";
import { SidebarNav, DASHBOARD_NAV_ITEMS } from "./components/SidebarNav";
import { OverviewModule } from "./components/OverviewModule";
import { UnslothTrainingModule } from "./components/UnslothTrainingModule";
import { GoogleColabSettings } from "./components/GoogleColabSettings";
import { LoginScreen } from "./components/LoginScreen";
import { UserManagementModule } from "./components/UserManagementModule";
import { InfrastructureModule } from "./components/InfrastructureModule";
import { PlaceholderModuleView } from "./components/PlaceholderModules";

export interface AppProps {
  apiBaseUrl?: string;
  adminToken?: string;
  csrfToken?: string;
  initialModule?: DashboardModuleId;
  initialUser?: AuthenticatedUser | null;
}

export const App: React.FC<AppProps> = ({
  apiBaseUrl = "",
  adminToken = "",
  csrfToken: initialCsrfToken = "",
  initialModule = "overview",
  initialUser = null,
}) => {
  const [activeModule, setActiveModule] =
    useState<DashboardModuleId>(initialModule);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    initialUser
  );
  const [csrfToken, setCsrfToken] = useState<string>(initialCsrfToken);
  const [authChecking, setAuthChecking] = useState<boolean>(!initialUser);
  const [colabStatus, setColabStatus] = useState<ColabStatusResponse | null>(
    null
  );
  const [unslothConfig, setUnslothConfig] = useState<UnslothTrainingConfig>(
    DEFAULT_UNSLOTH_CONFIG
  );

  const checkSession = useCallback(async () => {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) {
        headers["X-Hexa-Admin-Token"] = adminToken;
      }
      const res = await fetch(`${apiBaseUrl}/api/auth/session`, {
        method: "GET",
        credentials: "include",
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          authenticated: boolean;
          user: AuthenticatedUser | null;
          csrfToken: string;
        };
        setCsrfToken(data.csrfToken || "");
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      }
    } catch {
      // Remain unauthenticated if backend cannot be reached
      setCurrentUser(null);
    } finally {
      setAuthChecking(false);
    }
  }, [apiBaseUrl, adminToken]);

  useEffect(() => {
    if (!initialUser) {
      void checkSession();
    }
  }, [initialUser, checkSession]);

  const handleLoginSuccess = (user: AuthenticatedUser, nextCsrf: string) => {
    setCurrentUser(user);
    setCsrfToken(nextCsrf);
    setActiveModule("overview");
  };

  const handleLogout = async () => {
    try {
      const headers: Record<string, string> = {
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as { csrfToken?: string };
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      }
    } finally {
      setCurrentUser(null);
      setColabStatus(null);
      setActiveModule("overview");
    }
  };

  // Block unauthenticated users from protected dashboard content
  if (!currentUser) {
    if (authChecking) {
      return (
        <div className="hexa-login-viewport">
          <div className="hexa-card login-card">
            <div className="login-brand-header">
              <span className="brand-primary-domain">inexa.space</span>
              <h1 className="login-title">HEXA AI Lab</h1>
              <p className="login-subtitle">Verifying session security...</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <LoginScreen
        apiBaseUrl={apiBaseUrl}
        csrfToken={csrfToken}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const currentNavMeta =
    DASHBOARD_NAV_ITEMS.find((item) => item.id === activeModule) ||
    DASHBOARD_NAV_ITEMS[0];

  const renderActiveModule = () => {
    switch (activeModule) {
      case "overview":
        return (
          <OverviewModule
            colabStatus={colabStatus}
            unslothConfig={unslothConfig}
            onNavigate={setActiveModule}
          />
        );
      case "unsloth":
        return (
          <UnslothTrainingModule
            config={unslothConfig}
            onUpdateConfig={setUnslothConfig}
          />
        );
      case "infrastructure":
        return (
          <InfrastructureModule
            apiBaseUrl={apiBaseUrl}
            adminToken={adminToken}
            csrfToken={csrfToken}
            currentUser={currentUser}
          />
        );
      case "colab":
        return (
          <GoogleColabSettings
            apiBaseUrl={apiBaseUrl}
            adminToken={adminToken}
            csrfToken={csrfToken}
            onStatusUpdate={setColabStatus}
          />
        );
      case "team":
        return (
          <UserManagementModule
            apiBaseUrl={apiBaseUrl}
            adminToken={adminToken}
            csrfToken={csrfToken}
            currentUser={currentUser}
          />
        );
      default:
        return (
          <PlaceholderModuleView
            moduleId={activeModule}
            colabStatus={colabStatus}
            onNavigate={setActiveModule}
          />
        );
    }
  };

  return (
    <div className="hexa-app-shell">
      <SidebarNav
        activeModule={activeModule}
        userRole={currentUser.role}
        onSelectModule={setActiveModule}
      />

      <div className="hexa-main-area">
        <header className="hexa-topbar">
          <div className="topbar-breadcrumb">
            <span className="breadcrumb-category">{currentNavMeta.category}</span>
            <span className="breadcrumb-sep">/</span>
            <strong className="breadcrumb-current">{currentNavMeta.label}</strong>
          </div>

          <div className="topbar-status-group">
            <span className="topbar-pill">
              <span className="status-dot dot-teal" />
              Mode: <strong>MANUAL</strong>
            </span>
            <span className="topbar-pill">
              User: <strong>{currentUser.displayName}</strong> ({currentUser.role})
            </span>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => void handleLogout()}
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="hexa-content-viewport">{renderActiveModule()}</main>
      </div>
    </div>
  );
};

export default App;
