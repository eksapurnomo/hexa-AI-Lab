import React from "react";
import { DashboardModuleId, ColabStatusResponse } from "../types/colab";

export interface PlaceholderModuleProps {
  moduleId: DashboardModuleId;
  colabStatus: ColabStatusResponse | null;
  onNavigate: (moduleId: DashboardModuleId) => void;
}

export const PlaceholderModuleView: React.FC<PlaceholderModuleProps> = ({
  moduleId,
  colabStatus,
  onNavigate,
}) => {
  if (moduleId === "datasets") {
    return (
      <div className="module-container">
        <header className="module-header">
          <div>
            <span className="module-eyebrow">Data Pipeline</span>
            <h1 className="module-title">Dataset Management</h1>
            <p className="module-subtitle">
              Prepare, validate, and format instruction datasets for QLoRA fine-tuning.
            </p>
          </div>
          <span className="status-badge badge-neutral">Backend Integration Pending</span>
        </header>

        <div className="info-callout">
          <strong>Honest Status Notice:</strong> Dataset ingestion and Google Drive storage sync (
          <code>GOOGLE_DRIVE_DATASET_FOLDER_ID</code>) require separate Drive OAuth authorization
          and backend service connection. No fake dataset records are displayed.
        </div>

        <div className="two-col-layout">
          <div className="hexa-card">
            <h2 className="section-title">Supported Dataset Schemas</h2>
            <p className="section-subtitle">
              Ready-to-wire schema validators for supervised fine-tuning (SFT).
            </p>
            <table className="hexa-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Required Columns</th>
                  <th>Parser Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Alpaca Instruction</strong>
                  </td>
                  <td className="font-mono">instruction, input, output</td>
                  <td>
                    <span className="status-badge badge-teal">Schema Ready</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>ShareGPT Multi-Turn</strong>
                  </td>
                  <td className="font-mono">conversations (from, value)</td>
                  <td>
                    <span className="status-badge badge-teal">Schema Ready</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Raw JSONL / Parquet</strong>
                  </td>
                  <td className="font-mono">text</td>
                  <td>
                    <span className="status-badge badge-teal">Schema Ready</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="hexa-card">
            <h2 className="section-title">Registered Datasets</h2>
            <p className="section-subtitle">Current workspace dataset repository.</p>
            <div className="empty-state-box">
              <strong>0 Datasets Loaded</strong>
              <p>
                Connect the dataset storage backend or specify a manual dataset path inside your
                Colab notebook.
              </p>
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => onNavigate("unsloth")}
              >
                Go to Training Configuration &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (moduleId === "jobs") {
    return (
      <div className="module-container">
        <header className="module-header">
          <div>
            <span className="module-eyebrow">Execution Queue</span>
            <h1 className="module-title">Training Jobs</h1>
            <p className="module-subtitle">
              Monitor fine-tuning runs, step loss telemetry, and checkpoint exports.
            </p>
          </div>
          <span className="status-badge badge-neutral">0 Active Jobs</span>
        </header>

        <div className="info-callout">
          <strong>Honest Status Notice:</strong> Automated background job orchestration is not
          enabled while Google Cloud appeal is pending. Training runs are executed manually via the
          Colab notebook environment.
        </div>

        <div className="hexa-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Job Execution Queue</h2>
              <p className="section-subtitle">Real-time job tracker (no synthetic entries).</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate("unsloth")}
            >
              Training Configuration
            </button>
          </div>

          <div className="empty-state-box">
            <strong>No Active or Historical Training Jobs</strong>
            <p>
              Zero jobs have been dispatched. Once the job runner backend is connected, live training
              logs and loss curves will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (moduleId === "evaluation") {
    return (
      <div className="module-container">
        <header className="module-header">
          <div>
            <span className="module-eyebrow">Quality Assurance</span>
            <h1 className="module-title">Evaluation &amp; Benchmark</h1>
            <p className="module-subtitle">
              Compare fine-tuned checkpoints against base models on validation datasets.
            </p>
          </div>
          <span className="status-badge badge-neutral">Integration Pending</span>
        </header>

        <div className="info-callout">
          <strong>Honest Status Notice:</strong> Benchmark execution engine is not connected yet.
          Below is the prepared evaluation matrix structure ready for backend integration.
        </div>

        <div className="hexa-card">
          <h2 className="section-title">Prepared Benchmark Dimensions</h2>
          <p className="section-subtitle">
            Metrics will populate only after an actual evaluation run completes.
          </p>
          <table className="hexa-table">
            <thead>
              <tr>
                <th>Metric Group</th>
                <th>Target Measurement</th>
                <th>Current Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Validation Loss &amp; Perplexity</strong>
                </td>
                <td>Cross-entropy loss on held-out split</td>
                <td className="font-mono">Awaiting Evaluation Run</td>
              </tr>
              <tr>
                <td>
                  <strong>Instruction Following</strong>
                </td>
                <td>Exact-match &amp; rubric score</td>
                <td className="font-mono">Awaiting Evaluation Run</td>
              </tr>
              <tr>
                <td>
                  <strong>Inference Throughput</strong>
                </td>
                <td>Tokens/sec &amp; VRAM footprint (4-bit)</td>
                <td className="font-mono">Awaiting Evaluation Run</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (moduleId === "models") {
    return (
      <div className="module-container">
        <header className="module-header">
          <div>
            <span className="module-eyebrow">Artifact Vault</span>
            <h1 className="module-title">Model Registry</h1>
            <p className="module-subtitle">
              Version control for LoRA adapters, merged 16-bit weights, and quantized GGUF builds.
            </p>
          </div>
          <span className="status-badge badge-neutral">0 Registered Models</span>
        </header>

        <div className="info-callout">
          <strong>Honest Status Notice:</strong> No trained model artifacts are registered yet.
          Environment variables <code>GOOGLE_DRIVE_CHECKPOINT_FOLDER_ID</code> and{" "}
          <code>GOOGLE_DRIVE_MODEL_FOLDER_ID</code> are reserved for future artifact sync.
        </div>

        <div className="hexa-card">
          <div className="empty-state-box">
            <strong>Model Registry is Empty</strong>
            <p>
              Complete a fine-tuning run in Manual Colab Mode and connect the storage adapter to
              register your first model checkpoint.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default: "settings"
  return (
    <div className="module-container">
      <header className="module-header">
        <div>
          <span className="module-eyebrow">Platform Configuration</span>
          <h1 className="module-title">Workspace Settings</h1>
          <p className="module-subtitle">
            Environment variables, encryption posture, and loopback server configuration for{" "}
            <code>/home/eksa/hexa-ai-lab</code>.
          </p>
        </div>
        <span className="status-badge badge-teal">Strict Isolation</span>
      </header>

      <div className="two-col-layout">
        <div className="hexa-card">
          <h2 className="section-title">Environment &amp; Security Posture</h2>
          <p className="section-subtitle">
            Verified read-only summary of runtime security controls.
          </p>
          <table className="hexa-table">
            <tbody>
              <tr>
                <td>
                  <strong>Workspace Path</strong>
                </td>
                <td className="font-mono">/home/eksa/hexa-ai-lab</td>
              </tr>
              <tr>
                <td>
                  <strong>Colab Integration Mode</strong>
                </td>
                <td className="font-mono">{colabStatus?.activeMode || "MANUAL"}</td>
              </tr>
              <tr>
                <td>
                  <strong>Google OAuth Enabled</strong>
                </td>
                <td className="font-mono">
                  {colabStatus?.oauthEnabled ? "true" : "false (Disabled)"}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Credential &amp; Session Encryption</strong>
                </td>
                <td className="font-mono">AES-256-GCM + Salted scrypt (N=16384, r=8, p=1) Hashes</td>
              </tr>
              <tr>
                <td>
                  <strong>Backend Bind Address</strong>
                </td>
                <td className="font-mono">127.0.0.1:4173 &amp; 127.0.0.1:3001 (Loopback Only)</td>
              </tr>
              <tr>
                <td>
                  <strong>OAuth Scopes (Prepared)</strong>
                </td>
                <td className="font-mono">
                  {colabStatus?.scopes || "https://www.googleapis.com/auth/colaboratory"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="hexa-card">
          <h2 className="section-title">Google Drive Folder Placeholders</h2>
          <p className="section-subtitle">
            Reserved environment variables in <code>.env.example</code> (requires separate Drive
            authorization when enabled).
          </p>
          <table className="hexa-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono">GOOGLE_DRIVE_DATASET_FOLDER_ID</td>
                <td>
                  <span className="status-badge badge-neutral">Placeholder Only</span>
                </td>
              </tr>
              <tr>
                <td className="font-mono">GOOGLE_DRIVE_CHECKPOINT_FOLDER_ID</td>
                <td>
                  <span className="status-badge badge-neutral">Placeholder Only</span>
                </td>
              </tr>
              <tr>
                <td className="font-mono">GOOGLE_DRIVE_MODEL_FOLDER_ID</td>
                <td>
                  <span className="status-badge badge-neutral">Placeholder Only</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
