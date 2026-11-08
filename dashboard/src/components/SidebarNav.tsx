import React from "react";
import { DashboardModuleId, NavItem, UserRole } from "../types/colab";

export const DASHBOARD_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", category: "Core Workspace", statusBadge: "Live" },
  { id: "datasets", label: "Dataset Management", category: "ML Pipeline" },
  { id: "unsloth", label: "Model Training", category: "ML Pipeline", statusBadge: "Ready" },
  { id: "jobs", label: "Training Jobs", category: "ML Pipeline" },
  { id: "evaluation", label: "Evaluation & Benchmark", category: "ML Pipeline" },
  { id: "models", label: "Model Registry", category: "ML Pipeline" },
  {
    id: "infrastructure",
    label: "Infrastructure",
    category: "Infrastructure & Admin",
    statusBadge: "Admin",
    adminOnly: true,
  },
  {
    id: "colab",
    label: "Google Colab",
    category: "Infrastructure & Admin",
    statusBadge: "Manual",
    adminOnly: true,
  },
  {
    id: "team",
    label: "User Management",
    category: "Infrastructure & Admin",
    statusBadge: "RBAC",
    adminOnly: true,
  },
  { id: "settings", label: "Settings", category: "Infrastructure & Admin" },
];

export interface SidebarNavProps {
  activeModule: DashboardModuleId;
  userRole?: UserRole;
  onSelectModule: (moduleId: DashboardModuleId) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeModule,
  userRole = "Admin",
  onSelectModule,
}) => {
  const categories: Array<NavItem["category"]> = [
    "Core Workspace",
    "ML Pipeline",
    "Infrastructure & Admin",
  ];

  const isAdmin = userRole === "Admin";

  return (
    <aside className="hexa-sidebar" aria-label="Main Navigation">
      <div className="sidebar-brand">
        <div className="brand-logo-frame brand-logo-light-surface">
          <img
            src="/brand/inexa-light-logo.png"
            alt="inexa.space"
            className="brand-logo-img"
            width={168}
            height={52}
          />
        </div>
        <div className="brand-meta">
          <span className="brand-primary-domain">inexa.space</span>
          <span className="brand-title">HEXA AI Lab</span>
          <span className="brand-subtitle">Model Training &amp; Compute Studio</span>
        </div>
      </div>

      <nav className="sidebar-nav-list">
        {categories.map((category) => {
          const items = DASHBOARD_NAV_ITEMS.filter(
            (item) => item.category === category && (!item.adminOnly || isAdmin)
          );
          if (items.length === 0) return null;
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
                              isActive
                                ? "nav-item-badge badge-teal"
                                : "nav-item-badge badge-neutral"
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
