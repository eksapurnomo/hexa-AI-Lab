import React, { useState, useEffect, useCallback } from "react";
import { ColabStatusResponse, VerificationResult, RuntimeSpec } from "../types/colab";

export interface GoogleColabSettingsProps {
  apiBaseUrl?: string;
  adminToken: string;
  csrfToken: string;
  onStatusUpdate?: (status: ColabStatusResponse) => void;
}

export const GoogleColabSettings: React.FC<GoogleColabSettingsProps> = ({
  apiBaseUrl = "",
  adminToken,
  csrfToken,
  onStatusUpdate,
}) => {
  const [status, setStatus] = useState<ColabStatusResponse | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state (inputs are cleared after saving so secrets never remain on screen)
  const [clientIdInput, setClientIdInput] = useState<string>("");
  const [clientSecretInput, setClientSecretInput] = useState<string>("");
  const [projectIdInput, setProjectIdInput] = useState<string>("");
  const [manualNotebookUrlInput, setManualNotebookUrlInput] = useState<string>("");
  const [manualTunnelInput, setManualTunnelInput] = useState<string>("");

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/integrations/google/status`, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-Hexa-Admin-Token": adminToken,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Status check returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as ColabStatusResponse;
      setStatus(data);
      if (onStatusUpdate) {
        onStatusUpdate(data);
      }
    } catch {
      setErrorMessage(
        "Backend API at 127.0.0.1:3001 is offline or unreachable. Displaying safe local defaults (Manual Colab Mode)."
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminToken, onStatusUpdate]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBannerMessage(null);
    setErrorMessage(null);

    try {
      const payload: Record<string, string> = {};
      if (clientIdInput.trim()) payload.clientId = clientIdInput.trim();
      if (clientSecretInput.trim()) payload.clientSecret = clientSecretInput.trim();
      if (projectIdInput.trim()) payload.projectId = projectIdInput.trim();
      if (manualNotebookUrlInput.trim()) payload.manualNotebookUrl = manualNotebookUrlInput.trim();
      if (manualTunnelInput.trim()) payload.manualTunnelEndpoint = manualTunnelInput.trim();

      const res = await fetch(`${apiBaseUrl}/api/integrations/google/config`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Hexa-Admin-Token": adminToken,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Save failed with HTTP ${res.status}`);
      }

      // Clear secret inputs immediately after saving
      setClientIdInput("");
      setClientSecretInput("");
      setManualTunnelInput("");
      setBannerMessage("Credentials encrypted (AES-256-GCM) and saved securely.");
      await fetchStatus();
    } catch {
      setErrorMessage("Failed to save Google Colab credentials. Ensure backend server is running.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setBannerMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/integrations/google/test-connection`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Hexa-Admin-Token": adminToken,
          "X-CSRF-Token": csrfToken,
        },
      });
      if (!res.ok) {
        throw new Error(`Verification failed with HTTP ${res.status}`);
      }
      const result = (await res.json()) as VerificationResult;
      setVerification(result);
      setBannerMessage("Non-destructive mocked connection verification passed.");
      await fetchStatus();
    } catch {
      setErrorMessage("Connection verification test encountered an error. Ensure backend is running.");
    } finally {
      setTesting(false);
    }
  };

  const specsToDisplay: RuntimeSpec[] = verification?.runtimeSpecs || [
    { key: { variant: "VARIANT_CPU", shape: "SHAPE_STANDARD", accelerator: "NONE" }, eligible: true },
    { key: { variant: "VARIANT_GPU", shape: "SHAPE_STANDARD", accelerator: "T4" }, eligible: true },
    { key: { variant: "VARIANT_GPU", shape: "SHAPE_HIGHMEM", accelerator: "L4" }, eligible: true },
    { key: { variant: "VARIANT_GPU", shape: "SHAPE_HIGHMEM", accelerator: "A100" }, eligible: true },
    { key: { variant: "VARIANT_TPU", shape: "SHAPE_HIGHMEM", accelerator: "V5E" }, eligible: false },
  ];

  return (
    <div className="module-container hexa-colab-settings">
      <header className="module-header">
        <div>
          <span className="module-eyebrow">Compute Provider &amp; Security</span>
          <h1 className="module-title">Google Colab Integration Settings</h1>
          <p className="module-subtitle">
            Active Mode: <strong>{status?.activeMode || "MANUAL"}</strong> | Google Cloud Appeal:{" "}
            <strong>{status?.gcpAppealStatus || "PENDING"}</strong> (OAuth 2.0 Prepared &amp;
            Disabled)
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchStatus()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Connection Status"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? "Testing Colab API..." : "Test Google & Colab API"}
          </button>
        </div>
      </header>

      {bannerMessage && (
        <div className="alert-banner alert-teal" role="status">
          {bannerMessage}
        </div>
      )}

      {errorMessage && (
        <div className="alert-banner alert-warning" role="alert">
          {errorMessage}
        </div>
      )}

      <section className="summary-grid status-grid" aria-label="Colab Connection Status">
        <div className="hexa-card status-card">
          <span className="card-label">Google Connection Status</span>
          <div className="card-metric-sm">{status?.googleConnectionStatus || "MANUAL_ACTIVE"}</div>
          <span className="status-badge badge-teal">Manual Mode Active</span>
        </div>

        <div className="hexa-card status-card">
          <span className="card-label">OAuth Client ID Status</span>
          <div className="card-metric-sm">{status?.oauthClientIdStatus || "NOT_CONFIGURED"}</div>
          <span className="card-caption">{status?.clientIdMasked || "Not Configured"}</span>
        </div>

        <div className="hexa-card status-card">
          <span className="card-label">Refresh Token Status</span>
          <div className="card-metric-sm">{status?.refreshTokenStatus || "NOT_CONFIGURED"}</div>
          <span className="card-caption">AES-256-GCM Vault</span>
        </div>

        <div className="hexa-card status-card">
          <span className="card-label">Colab API Connection</span>
          <div className="card-metric-sm">
            {status?.colabApiConnectionStatus || "READY_FOR_TEST"}
          </div>
          <span className="card-caption">v1beta &amp; v1 Schemas</span>
        </div>

        <div className="hexa-card status-card">
          <span className="card-label">Subscription Tier</span>
          <div className="card-metric-sm">
            {verification?.subscription.tier || status?.subscriptionTier || "TIER_PRO"}
          </div>
          <span className="status-badge badge-teal">Colab Pro Profile</span>
        </div>

        <div className="hexa-card status-card">
          <span className="card-label">Runtime Eligibility</span>
          <div className="card-metric-sm">
            {status?.runtimeEligibility !== false ? "ELIGIBLE" : "STANDARD"}
          </div>
          <span className="card-caption">GPU (T4, L4, A100) &amp; High-RAM</span>
        </div>
      </section>

      <div className="two-col-layout">
        <section className="hexa-card credentials-form-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Save Google OAuth &amp; Manual Colab Credentials</h2>
              <p className="section-subtitle">
                Secrets are encrypted at rest with AES-256-GCM and never displayed after saving.
              </p>
            </div>
            <button
              type="button"
              className="btn-disabled"
              disabled={true}
              title="Disabled while Google Cloud appeal is pending"
            >
              OAuth Disabled (Appeal Pending)
            </button>
          </div>

          <form onSubmit={handleSaveCredentials} className="form-grid">
            <div className="form-field full-width">
              <label htmlFor="google-project-id">Google Cloud Project ID</label>
              <input
                id="google-project-id"
                type="text"
                value={projectIdInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setProjectIdInput(e.target.value)
                }
                placeholder={status?.projectId || "e.g., hexa-ai-lab-prod"}
              />
            </div>

            <div className="form-field">
              <label htmlFor="google-client-id">
                OAuth Client ID (Prepared for Appeal Approval)
              </label>
              <input
                id="google-client-id"
                type="text"
                value={clientIdInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setClientIdInput(e.target.value)
                }
                placeholder={status?.clientIdMasked || "xxxx.apps.googleusercontent.com"}
              />
            </div>

            <div className="form-field">
              <label htmlFor="google-client-secret">
                OAuth Client Secret (Never displayed after saving)
              </label>
              <input
                id="google-client-secret"
                type="password"
                value={clientSecretInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setClientSecretInput(e.target.value)
                }
                placeholder={
                  status?.hasClientSecret
                    ? "************ (Stored Encrypted)"
                    : "Enter Client Secret"
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="manual-notebook-url">Manual Colab Notebook URL (Active Mode)</label>
              <input
                id="manual-notebook-url"
                type="url"
                value={manualNotebookUrlInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setManualNotebookUrlInput(e.target.value)
                }
                placeholder={
                  status?.manualNotebookUrl || "https://colab.research.google.com/drive/..."
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="manual-tunnel-endpoint">Manual Runtime Tunnel Endpoint</label>
              <input
                id="manual-tunnel-endpoint"
                type="password"
                value={manualTunnelInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setManualTunnelInput(e.target.value)
                }
                placeholder={
                  status?.manualTunnelMasked || "Enter manual runtime proxy endpoint"
                }
              />
            </div>

            <div className="form-footer full-width">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Encrypting & Saving..." : "Save Credentials"}
              </button>
            </div>
          </form>
        </section>

        <section className="hexa-card runtime-specs-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Available Runtime Specifications</h2>
              <p className="section-subtitle">
                Official Colab v1beta runtime specifications &amp; hardware eligibility matrix.
              </p>
            </div>
            <span className="status-badge badge-teal">Non-Destructive</span>
          </div>

          <div className="table-responsive">
            <table className="hexa-table">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Shape</th>
                  <th>Accelerator</th>
                  <th>Eligibility</th>
                </tr>
              </thead>
              <tbody>
                {specsToDisplay.map((spec, idx) => (
                  <tr key={`${spec.key.variant}-${spec.key.accelerator}-${idx}`}>
                    <td className="font-mono">{spec.key.variant}</td>
                    <td className="font-mono">{spec.key.shape}</td>
                    <td>
                      <strong>{spec.key.accelerator}</strong>
                    </td>
                    <td>
                      <span
                        className={
                          spec.eligible
                            ? "status-badge badge-teal"
                            : "status-badge badge-neutral"
                        }
                      >
                        {spec.eligible ? "Eligible" : "Ineligible"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {verification?.steps && verification.steps.length > 0 && (
            <div className="verification-steps-box">
              <h3 className="sub-heading">Verification Diagnostics</h3>
              <ul className="steps-list">
                {verification.steps.map((st) => (
                  <li key={st.step} className="step-row">
                    <span className="status-badge badge-teal">{st.status}</span>
                    <div>
                      <strong>{st.step}</strong>
                      <p>{st.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
