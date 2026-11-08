import React from "react";
import { ColabStatusResponse, DashboardModuleId } from "../types/colab";
import { UnslothTrainingConfig } from "../types/unsloth";

export interface OverviewModuleProps {
  colabStatus: ColabStatusResponse | null;
  unslothConfig: UnslothTrainingConfig;
  onNavigate: (moduleId: DashboardModuleId) => void;
}

export const OverviewModule: React.FC<OverviewModuleProps> = ({
  colabStatus,
  unslothConfig,
  onNavigate,
}) => {
  const activeMode = colabStatus?.activeMode || "MANUAL";
  const appealStatus = colabStatus?.gcpAppealStatus || "PENDING";
  const tier = colabStatus?.subscriptionTier || "TIER_PRO";

  const pipelineStages: Array<{
    step: string;
    title: string;
    status: string;
    badgeClass: string;
    description: string;
    targetModule: DashboardModuleId;
  }> = [
    {
      step: "Stage 01",
      title: "Dataset Preparation",
      status: "Placeholder Ready",
      badgeClass: "badge-neutral",
      description:
        "Schema ready for JSONL, Alpaca, and ShareGPT instruction datasets. Backend storage integration pending.",
      targetModule: "datasets",
    },
    {
      step: "Stage 02",
      title: "Unsloth QLoRA Configuration",
      status: "Configured",
      badgeClass: "badge-teal",
      description: `Base model: ${unslothConfig.baseModel} (LoRA r=${unslothConfig.loraRank}, alpha=${unslothConfig.loraAlpha}, 4-bit=${unslothConfig.loadIn4Bit ? "Enabled" : "Disabled"}).`,
      targetModule: "unsloth",
    },
    {
      step: "Stage 03",
      title: "Google Colab Compute Provider",
      status: `Mode: ${activeMode}`,
      badgeClass: "badge-teal",
      description:
        "Official Colab REST client (v1beta & v1) implemented. Manual Colab Mode is active while Google Cloud appeal is pending.",
      targetModule: "colab",
    },
    {
      step: "Stage 04",
      title: "Evaluation & Benchmark",
      status: "Placeholder Ready",
      badgeClass: "badge-neutral",
      description:
        "Prepared for validation loss, perplexity, and task accuracy metrics once training jobs complete.",
      targetModule: "evaluation",
    },
    {
      step: "Stage 05",
      title: "Model & Adapter Registry",
      status: "Placeholder Ready",
      badgeClass: "badge-neutral",
      description:
        "Prepared for versioning LoRA adapters, merged 16-bit checkpoints, and GGUF quantized exports.",
      targetModule: "models",
    },
  ];

  return (
    <div className="module-container">
      <div className="module-header">
        <div>
          <span className="module-eyebrow">Workspace Summary</span>
          <h1 className="module-title">HEXA AI Lab Overview</h1>
          <p className="module-subtitle">
            Centralized control plane for Unsloth QLoRA fine-tuning, dataset preparation, and Google
            Colab compute orchestration.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate("unsloth")}
          >
            Configure Unsloth
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate("colab")}
          >
            Colab Integration Settings
          </button>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <section className="summary-grid" aria-label="Key Workspace Metrics">
        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Dataset Status</span>
            <span className="status-badge badge-neutral">Integration Pending</span>
          </div>
          <div className="card-metric">0 Active Datasets</div>
          <p className="card-description">
            No dataset connected yet. Drive Dataset Folder variable is prepared in environment
            configuration.
          </p>
          <button
            type="button"
            className="card-link-btn"
            onClick={() => onNavigate("datasets")}
          >
            Open Dataset Management &rarr;
          </button>
        </div>

        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Training Jobs</span>
            <span className="status-badge badge-neutral">0 Running</span>
          </div>
          <div className="card-metric">Idle Queue</div>
          <p className="card-description">
            No automated training job is currently executing. Unsloth config is ready for Manual
            Colab execution.
          </p>
          <button
            type="button"
            className="card-link-btn"
            onClick={() => onNavigate("jobs")}
          >
            View Training Jobs &rarr;
          </button>
        </div>

        <div className="hexa-card summary-card">
          <div className="card-top-row">
            <span className="card-label">Model Registry</span>
            <span className="status-badge badge-neutral">Empty Registry</span>
          </div>
          <div className="card-metric">0 Registered Models</div>
          <p className="card-description">
            Awaiting fine-tuned LoRA adapters or GGUF exports. No synthetic or fake model entries
            are preloaded.
          </p>
          <button
            type="button"
            className="card-link-btn"
            onClick={() => onNavigate("models")}
          >
            Inspect Model Registry &rarr;
          </button>
        </div>

        <div className="hexa-card summary-card card-accent-teal">
          <div className="card-top-row">
            <span className="card-label">Compute Provider / Google Colab</span>
            <span className="status-badge badge-teal">{activeMode} MODE</span>
          </div>
          <div className="card-metric">{tier}</div>
          <p className="card-description">
            OAuth 2.0 is prepared &amp; disabled (GCP Appeal: <strong>{appealStatus}</strong>).
            AES-256-GCM credential vault active.
          </p>
          <button
            type="button"
            className="card-link-btn"
            onClick={() => onNavigate("colab")}
          >
            Manage Compute Provider &rarr;
          </button>
        </div>
      </section>

      {/* Development Pipeline */}
      <section className="hexa-card pipeline-section" aria-label="Development Pipeline">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Development Pipeline</h2>
            <p className="section-subtitle">
              End-to-end workflow status across dataset preparation, Unsloth fine-tuning, and Colab
              runtime execution.
            </p>
          </div>
          <span className="status-badge badge-teal">Manual Colab Workflow Active</span>
        </div>

        <div className="pipeline-list">
          {pipelineStages.map((stage) => (
            <div key={stage.step} className="pipeline-item">
              <div className="pipeline-step-col">
                <span className="pipeline-step-tag">{stage.step}</span>
              </div>
              <div className="pipeline-content-col">
                <div className="pipeline-title-row">
                  <h3 className="pipeline-item-title">{stage.title}</h3>
                  <span className={`status-badge ${stage.badgeClass}`}>{stage.status}</span>
                </div>
                <p className="pipeline-item-desc">{stage.description}</p>
              </div>
              <div className="pipeline-action-col">
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => onNavigate(stage.targetModule)}
                >
                  Open Module
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
