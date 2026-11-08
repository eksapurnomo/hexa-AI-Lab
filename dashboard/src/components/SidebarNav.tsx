import React from "react";
import { DashboardModuleId, NavItem } from "../types/colab";

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", category: "Core Workspace", statusBadge: "Live" },
  { id: "datasets", label: "Dataset Management", category: "ML Pipeline" },
  { id: "unsloth", label: "Training & Unsloth", category: "ML Pipeline", statusBadge: "Ready" },
  { id: "jobs", label: "Training Jobs", category: "ML Pipeline" },
  { id: "evaluation", label: "Evaluation & Benchmark", category: "ML Pipeline" },
  { id: "models", label: "Model Registry", category: "ML Pipeline" },
  { id: "colab", label: "Google Colab", category: "Infrastructure & Admin", statusBadge: "Manual" },
  { id: "team", label: "Team Management", category: "Infrastructure & Admin" },
  { id: "settings", label: "Settings", category: "Infrastructure & Admin" },
];

export interface SidebarNavProps {
  activeModule: DashboardModuleId;
  onSelectModule: (moduleId: DashboardModuleId) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeModule, onSelectModule }) => {
  const categories: Array<NavItem["category"]> = [
    "Core Workspace",
    "ML Pipeline",
    "Infrastructure & Admin",
  ];

  return (
    <aside className="hexa-sidebar" aria-label="Main Navigation">
      <div className="sidebar-brand">
        <div className="brand-logo-frame">
          <img
            src="/brand/inexa-teal-logo.png"
            alt="inexa.space — HEXA AI Lab Logo"
            className="brand-logo-img"
            width={148}
            height={62}
          />
        </div>
        <div className="brand-meta">
          <span className="brand-title">HEXA AI Lab</span>
          <span className="brand-subtitle">Fine-Tuning &amp; Compute Studio</span>
        </div>
      </div>

      <nav className="sidebar-nav-list">
        {categories.map((category) => {
          const items = DASHBOARD_NAV_ITEMS.filter((item) => item.category === category);
          return (
            <div key={category} className="nav-category-group">
              <div className="nav-category-title">{category}</div>
              <ul className="nav-items">
                {items.map((item) => {
                  const isActive = activeModule === item.id;
                  return (
                    <li key={item.id} className="nav-item-wrapper">
                      <button
                        type="button"
                        onClick={() => onSelectModule(item.id)}
                        className={isActive ? "nav-item-btn active" : "nav-item-btn"}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="nav-item-indicator" />
                        <span className="nav-item-label">{item.label}</span>
                        {item.statusBadge && (
                          <span
                            className={
                              isActive ? "nav-item-badge badge-teal" : "nav-item-badge badge-neutral"
                            }
                          >
                            {item.statusBadge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-mode-pill">
          <span className="status-dot dot-teal" />
          <div className="sidebar-mode-text">
            <strong>Colab Mode: MANUAL</strong>
            <span>OAuth 2.0 Disabled (Appeal Pending)</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
