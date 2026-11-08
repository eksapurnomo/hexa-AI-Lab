import React, { useState, useEffect, useCallback } from "react";
import {
  AuthenticatedUser,
  InfrastructureRecord,
  InfrastructureSummary,
  InfrastructureType,
  InfrastructureEnvironment,
  InfrastructureStatus,
} from "../types/colab";

export interface InfrastructureModuleProps {
  apiBaseUrl?: string;
  adminToken?: string;
  csrfToken: string;
  currentUser: AuthenticatedUser;
}

const INFRA_TYPES: InfrastructureType[] = [
  "Local Server",
  "VPS",
  "Cloud Server",
  "GPU Server",
  "Dedicated Server",
  "Compute Node",
  "Other",
];

const INFRA_ENVIRONMENTS: InfrastructureEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

const INFRA_STATUSES: InfrastructureStatus[] = [
  "Registered",
  "Online",
  "Offline",
  "Maintenance",
];

export const InfrastructureModule: React.FC<InfrastructureModuleProps> = ({
  apiBaseUrl = "",
  adminToken = "",
  csrfToken,
  currentUser,
}) => {
  const [items, setItems] = useState<InfrastructureRecord[]>([]);
  const [summary, setSummary] = useState<InfrastructureSummary>({
    totalRegistered: 0,
    onlineCount: 0,
    offlineCount: 0,
    gpuEnabledCount: 0,
    activeComputeCount: 0,
    maintenanceCount: 0,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState<string>("");
  const [type, setType] = useState<InfrastructureType>("GPU Server");
  const [provider, setProvider] = useState<string>("");
  const [environment, setEnvironment] =
    useState<InfrastructureEnvironment>("Development");
  const [hostnameOrIp, setHostnameOrIp] = useState<string>("");
  const [operatingSystem, setOperatingSystem] = useState<string>("");
  const [cpuSpecs, setCpuSpecs] = useState<string>("");
  const [ramCapacity, setRamCapacity] = useState<string>("");
  const [gpuModel, setGpuModel] = useState<string>("");
  const [gpuVram, setGpuVram] = useState<string>("");
  const [storageCapacity, setStorageCapacity] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");
  const [status, setStatus] = useState<InfrastructureStatus>("Registered");
  const [notes, setNotes] = useState<string>("");

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setType("GPU Server");
    setProvider("");
    setEnvironment("Development");
    setHostnameOrIp("");
    setOperatingSystem("");
    setCpuSpecs("");
    setRamCapacity("");
    setGpuModel("");
    setGpuVram("");
    setStorageCapacity("");
    setRegion("");
    setPurpose("");
    setStatus("Registered");
    setNotes("");
  };

  const fetchInfrastructure = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;
      const res = await fetch(`${apiBaseUrl}/api/infrastructure`, {
        method: "GET",
        credentials: "include",
        headers,
        cache: "no-store",
      });
      const data = (await res.json()) as {
        items?: InfrastructureRecord[];
        summary?: InfrastructureSummary;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setItems(data.items || []);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to load infrastructure inventory."
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminToken]);

  useEffect(() => {
    void fetchInfrastructure();
  }, [fetchInfrastructure]);

  const handleEditSelect = (rec: InfrastructureRecord) => {
    setEditingId(rec.id);
    setName(rec.name);
    setType(rec.type);
    setProvider(rec.provider);
    setEnvironment(rec.environment);
    setHostnameOrIp(rec.hostnameOrIp);
    setOperatingSystem(rec.operatingSystem);
    setCpuSpecs(rec.cpuSpecs);
    setRamCapacity(rec.ramCapacity);
    setGpuModel(rec.gpuModel);
    setGpuVram(rec.gpuVram);
    setStorageCapacity(rec.storageCapacity);
    setRegion(rec.region);
    setPurpose(rec.purpose);
    setStatus(rec.status);
    setNotes(rec.notes);
    setNotice(null);
    setErrorMsg(null);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const endpoint = editingId
        ? `${apiBaseUrl}/api/infrastructure/update`
        : `${apiBaseUrl}/api/infrastructure/create`;

      const payload: Record<string, unknown> = {
        name,
        type,
        provider,
        environment,
        hostnameOrIp,
        operatingSystem,
        cpuSpecs,
        ramCapacity,
        gpuModel,
        gpuVram,
        storageCapacity,
        region,
        purpose,
        status,
        notes,
      };
      if (editingId) payload.id = editingId;

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to save infrastructure entry.");
      }

      setNotice(data.message || "Infrastructure saved.");
      resetForm();
      await fetchInfrastructure();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to save infrastructure entry."
      );
    }
  };

  const handleToggleActive = async (rec: InfrastructureRecord) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/infrastructure/update`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          id: rec.id,
          active: !rec.active,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to update entry.");
      }
      setNotice(
        `Infrastructure '${rec.name}' ${!rec.active ? "activated" : "deactivated"}.`
      );
      await fetchInfrastructure();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update entry.");
    }
  };

  if (currentUser.role !== "Admin") {
    return (
      <div className="module-container">
        <div className="alert-banner alert-error" role="alert">
          Access Denied: Infrastructure Management is restricted to Administrators.
        </div>
      </div>
    );
  }

  return (
    <div className="module-container">
      <header className="module-header">
        <div>
          <span className="module-eyebrow">
            inexa.space — Compute &amp; Server Inventory
          </span>
          <h1 className="module-title">Infrastructure Management</h1>
          <p className="module-subtitle">
            Centralized registry for Local Docker/WSL nodes, Hostinger VPS, Google Cloud, and
            dedicated GPU servers. Status is manually verified (no automatic remote execution or
            SSH key storage).
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchInfrastructure()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Inventory"}
          </button>
        </div>
      </header>

      {notice && (
        <div className="alert-banner alert-teal" role="status">
          {notice}
        </div>
      )}

      {errorMsg && (
        <div className="alert-banner alert-error" role="alert">
          {errorMsg}
        </div>
      )}

      {/* 5 Summary Cards */}
      <section className="summary-grid summary-grid-five" aria-label="Infrastructure Summary">
        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Total Registered</span>
            <span className="status-badge badge-neutral">Inventory</span>
          </div>
          <div className="card-metric">{summary.totalRegistered} Servers</div>
          <p className="card-description">
            Encrypted at rest in <code>.hexa-infrastructure.enc</code>.
          </p>
        </div>

        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Online Servers</span>
            <span className="status-badge badge-teal">Manual Status</span>
          </div>
          <div className="card-metric">{summary.onlineCount} Online</div>
          <p className="card-description">
            Explicitly marked Online by Administrator.
          </p>
        </div>

        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Offline Servers</span>
            <span className="status-badge badge-neutral">Standby</span>
          </div>
          <div className="card-metric">{summary.offlineCount} Offline</div>
          <p className="card-description">
            Inactive or powered-down compute targets.
          </p>
        </div>

        <div className="hexa-card summary-card card-accent-teal">
          <div className="card-top-row">
            <span className="card-label">GPU-Enabled</span>
            <span className="status-badge badge-teal">Accelerators</span>
          </div>
          <div className="card-metric">{summary.gpuEnabledCount} GPU Nodes</div>
          <p className="card-description">
            Configured with dedicated GPU &amp; VRAM metadata.
          </p>
        </div>

        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Compute Resources</span>
            <span className="status-badge badge-neutral">Active Pool</span>
          </div>
          <div className="card-metric">{summary.activeComputeCount} Active</div>
          <p className="card-description">
            {summary.maintenanceCount} in Maintenance mode.
          </p>
        </div>
      </section>

      {/* Register / Edit Form */}
      <section className="hexa-card" aria-label="Register Infrastructure">
        <form onSubmit={handleSubmitForm}>
          <div className="section-header-row">
            <div>
              <h2 className="section-title">
                {editingId
                  ? "Edit Infrastructure Entry"
                  : "Register Infrastructure Resource"}
              </h2>
              <p className="section-subtitle">
                Do not enter SSH private keys or plaintext passwords. Newly registered entries
                default to <strong>Registered</strong> status.
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                className="btn-outline-sm"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="form-grid form-grid-three">
            <div className="form-field">
              <label htmlFor="infra-name">Server Name *</label>
              <input
                id="infra-name"
                type="text"
                placeholder="e.g. hexa-gpu-jakarta-01"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setName(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-type">Infrastructure Type *</label>
              <select
                id="infra-type"
                value={type}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setType(e.target.value as InfrastructureType)
                }
              >
                {INFRA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="infra-provider">Provider *</label>
              <input
                id="infra-provider"
                type="text"
                placeholder="e.g. Local WSL / Hostinger VPS / GCP"
                value={provider}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setProvider(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-env">Environment</label>
              <select
                id="infra-env"
                value={environment}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setEnvironment(e.target.value as InfrastructureEnvironment)
                }
              >
                {INFRA_ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="infra-host">Hostname or IP Address *</label>
              <input
                id="infra-host"
                type="text"
                placeholder="e.g. 192.168.1.50 or node01.inexa.space"
                value={hostnameOrIp}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setHostnameOrIp(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-status">Manual Status</label>
              <select
                id="infra-status"
                value={status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStatus(e.target.value as InfrastructureStatus)
                }
              >
                {INFRA_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="infra-os">Operating System</label>
              <input
                id="infra-os"
                type="text"
                placeholder="e.g. Ubuntu 24.04 LTS"
                value={operatingSystem}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setOperatingSystem(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-cpu">CPU Specifications</label>
              <input
                id="infra-cpu"
                type="text"
                placeholder="e.g. 16 vCPU AMD EPYC"
                value={cpuSpecs}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCpuSpecs(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-ram">RAM Capacity</label>
              <input
                id="infra-ram"
                type="text"
                placeholder="e.g. 64 GB DDR5"
                value={ramCapacity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRamCapacity(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-gpu">GPU Model (if applicable)</label>
              <input
                id="infra-gpu"
                type="text"
                placeholder="e.g. NVIDIA L4 / RTX 4090"
                value={gpuModel}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setGpuModel(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-vram">GPU VRAM</label>
              <input
                id="infra-vram"
                type="text"
                placeholder="e.g. 24 GB"
                value={gpuVram}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setGpuVram(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-storage">Storage Capacity</label>
              <input
                id="infra-storage"
                type="text"
                placeholder="e.g. 1 TB NVMe"
                value={storageCapacity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStorageCapacity(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-region">Region / Location</label>
              <input
                id="infra-region"
                type="text"
                placeholder="e.g. Jakarta / ap-southeast-3"
                value={region}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRegion(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-purpose">Assigned Workload / Purpose</label>
              <input
                id="infra-purpose"
                type="text"
                placeholder="e.g. QLoRA Training & Dataset Curation"
                value={purpose}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPurpose(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="infra-notes">Notes</label>
              <input
                id="infra-notes"
                type="text"
                placeholder="Non-sensitive operational notes"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNotes(e.target.value)
                }
              />
            </div>
          </div>

          <div className="form-footer">
            <button type="submit" className="btn-primary">
              {editingId ? "Save Infrastructure Changes" : "Register Infrastructure"}
            </button>
          </div>
        </form>
      </section>

      {/* Inventory Table */}
      <section className="hexa-card" aria-label="Infrastructure Inventory">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">
              Registered Infrastructure Inventory ({items.length})
            </h2>
            <p className="section-subtitle">
              Integration-ready catalog for Local Docker/WSL, Hostinger VPS, Google Cloud, and GPU
              compute servers.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state-box">
            <strong>0 Infrastructure Resources Registered</strong>
            <p>
              Use the registration form above to add your first Local Server, VPS, Cloud Server, or
              GPU Compute Node.
            </p>
          </div>
        ) : (
          <table className="hexa-table">
            <thead>
              <tr>
                <th>Server Name</th>
                <th>Type &amp; Provider</th>
                <th>Environment</th>
                <th>Host / IP</th>
                <th>Hardware (CPU / RAM / GPU)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((rec) => (
                <tr key={rec.id}>
                  <td>
                    <strong>{rec.name}</strong>
                    <div className="table-subtext">{rec.purpose || rec.region || "-"}</div>
                  </td>
                  <td>
                    <div>{rec.type}</div>
                    <div className="table-subtext">{rec.provider}</div>
                  </td>
                  <td>
                    <span className="status-badge badge-neutral">{rec.environment}</span>
                  </td>
                  <td className="font-mono">{rec.hostnameOrIp}</td>
                  <td>
                    <div>
                      {rec.cpuSpecs || "CPU -"} | {rec.ramCapacity || "RAM -"}
                    </div>
                    {rec.gpuModel && (
                      <div className="table-subtext">
                        GPU: {rec.gpuModel} ({rec.gpuVram || "VRAM -"})
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        !rec.active
                          ? "status-badge badge-amber"
                          : rec.status === "Online"
                          ? "status-badge badge-teal"
                          : "status-badge badge-neutral"
                      }
                    >
                      {!rec.active ? "Deactivated" : rec.status}
                    </span>
                  </td>
                  <td>
                    <div className="table-action-row">
                      <button
                        type="button"
                        className="btn-outline-sm"
                        onClick={() => handleEditSelect(rec)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-outline-sm"
                        onClick={() => void handleToggleActive(rec)}
                      >
                        {rec.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

