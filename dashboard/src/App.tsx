import React, { useState } from "react";
import { DashboardModuleId, ColabStatusResponse } from "./types/colab";
import { UnslothTrainingConfig, DEFAULT_UNSLOTH_CONFIG } from "./types/unsloth";
import { SidebarNav, DASHBOARD_NAV_ITEMS } from "./components/SidebarNav";
import { OverviewModule } from "./components/OverviewModule";
import { UnslothTrainingModule } from "./components/UnslothTrainingModule";
import { GoogleColabSettings } from "./components/GoogleColabSettings";
import { PlaceholderModuleView } from "./components/PlaceholderModules";

export interface AppProps {
  adminToken: string;
  csrfToken: string;
  initialModule?: DashboardModuleId;
}

export const App: React.FC<AppProps> = ({
  adminToken,
  csrfToken,
  initialModule = "overview",
}) => {
  const [activeModule, setActiveModule] = useState<DashboardModuleId>(initialModule);
  const [colabStatus, setColabStatus] = useState<ColabStatusResponse | null>(null);
  const [unslothConfig, setUnslothConfig] = useState<UnslothTrainingConfig>(DEFAULT_UNSLOTH_CONFIG);

  const currentNavMeta =
    DASHBOARD_NAV_ITEMS.find((item) => item.id === activeModule) || DASHBOARD_NAV_ITEMS[0];

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
      case "colab":
        return (
          <GoogleColabSettings
            adminToken={adminToken}
            csrfToken={csrfToken}
            onStatusUpdate={setColabStatus}
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
      <SidebarNav activeModule={activeModule} onSelectModule={setActiveModule} />

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
              OAuth: <strong>DISABLED</strong>
            </span>
            <span className="topbar-pill">
              Theme: <strong>Light</strong>
            </span>
          </div>
        </header>

        <main className="hexa-content-viewport">{renderActiveModule()}</main>
      </div>
    </div>
  );
};

export default App;
