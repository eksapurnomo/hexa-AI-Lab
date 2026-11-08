import React, { useState } from "react";
import {
  UnslothTrainingConfig,
  DEFAULT_UNSLOTH_CONFIG,
} from "../types/unsloth";

export interface UnslothTrainingModuleProps {
  config: UnslothTrainingConfig;
  onUpdateConfig: (next: UnslothTrainingConfig) => void;
}

const SUPPORTED_MODELS = [
  "unsloth/Llama-3.2-3B-Instruct-bnb-4bit",
  "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
  "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
  "unsloth/Mistral-7B-Instruct-v0.3-bnb-4bit",
  "unsloth/gemma-2-9b-it-bnb-4bit",
];

const ALL_PROJECTION_MODULES = [
  "q_proj",
  "k_proj",
  "v_proj",
  "o_proj",
  "gate_proj",
  "up_proj",
  "down_proj",
];

export const UnslothTrainingModule: React.FC<UnslothTrainingModuleProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleFieldChange = <K extends keyof UnslothTrainingConfig>(
    key: K,
    value: UnslothTrainingConfig[K]
  ) => {
    setSavedNotice(null);
    onUpdateConfig({
      ...config,
      [key]: value,
    });
  };

  const handleToggleTargetModule = (modName: string) => {
    setSavedNotice(null);
    const exists = config.targetModules.includes(modName);
    const updated = exists
      ? config.targetModules.filter((m) => m !== modName)
      : [...config.targetModules, modName];
    onUpdateConfig({
      ...config,
      targetModules: updated.length > 0 ? updated : ["q_proj", "v_proj"],
    });
  };

  const handleResetDefaults = () => {
    onUpdateConfig({ ...DEFAULT_UNSLOTH_CONFIG });
    setSavedNotice("Unsloth configuration restored to recommended defaults.");
  };

  const handleApplyPreset = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(
      "Unsloth QLoRA configuration applied. Ready for Manual Colab notebook execution."
    );
  };

  const generatedPythonSnippet = `# HEXA AI Lab — Unsloth QLoRA Fine-Tuning Configuration (Manual Colab Mode)
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "${config.baseModel}",
    max_seq_length = ${config.maxSeqLength},
    dtype = ${config.dtype === "auto" ? "None" : `"${config.dtype}"`},
    load_in_4bit = ${config.loadIn4Bit ? "True" : "False"},
)

model = FastLanguageModel.get_peft_model(
    model,
    r = ${config.loraRank},
    target_modules = ${JSON.stringify(config.targetModules)},
    lora_alpha = ${config.loraAlpha},
    lora_dropout = ${config.loraDropout},
    bias = "none",
    use_gradient_checkpointing = "${config.gradientCheckpointing}",
    random_state = 3407,
)

training_args = TrainingArguments(
    per_device_train_batch_size = ${config.perDeviceBatchSize},
    gradient_accumulation_steps = ${config.gradientAccumulationSteps},
    warmup_steps = ${config.warmupSteps},
    num_train_epochs = ${config.numTrainEpochs},
    learning_rate = ${config.learningRate},
    optim = "${config.optimizer}",
    lr_scheduler_type = "${config.lrSchedulerType}",
    output_dir = "outputs",
)`;

  return (
    <div className="module-container">
      <div className="module-header">
        <div>
          <span className="module-eyebrow">Fine-Tuning Engine</span>
          <h1 className="module-title">Training &amp; Unsloth Configuration</h1>
          <p className="module-subtitle">
            Configure memory-efficient 4-bit QLoRA parameters and export ready-to-run Unsloth
            specifications for Manual Colab Mode.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={handleResetDefaults}>
            Reset Defaults
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="alert-banner alert-teal" role="status">
          {savedNotice}
        </div>
      )}

      <div className="two-col-layout">
        <form className="hexa-card form-card" onSubmit={handleApplyPreset}>
          <div className="section-header-row">
            <div>
              <h2 className="section-title">1. Base Model &amp; Quantization</h2>
              <p className="section-subtitle">
                Select pre-quantized 4-bit Unsloth models optimized for T4, L4, and A100 GPUs.
              </p>
            </div>
            <span className="status-badge badge-teal">QLoRA 4-Bit</span>
          </div>

          <div className="form-grid">
            <div className="form-field full-width">
              <label htmlFor="unsloth-base-model">Base Model Identifier</label>
              <select
                id="unsloth-base-model"
                value={config.baseModel}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange("baseModel", e.target.value)
                }
              >
                {SUPPORTED_MODELS.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-seq-len">Max Sequence Length</label>
              <select
                id="unsloth-seq-len"
                value={String(config.maxSeqLength)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange("maxSeqLength", Number(e.target.value))
                }
              >
                <option value="1024">1024 tokens</option>
                <option value="2048">2048 tokens</option>
                <option value="4096">4096 tokens</option>
                <option value="8192">8192 tokens</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-dtype">Compute Precision (dtype)</label>
              <select
                id="unsloth-dtype"
                value={config.dtype}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange(
                    "dtype",
                    e.target.value as UnslothTrainingConfig["dtype"]
                  )
                }
              >
                <option value="auto">Auto-detect (FP16 / BF16)</option>
                <option value="float16">Float16 (Tesla T4)</option>
                <option value="bfloat16">Bfloat16 (Ampere L4 / A100)</option>
              </select>
            </div>
          </div>

          <hr className="section-divider" />

          <div className="section-header-row">
            <div>
              <h2 className="section-title">2. LoRA Adapter Architecture</h2>
              <p className="section-subtitle">
                Configure low-rank matrices and Unsloth gradient checkpointing.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="unsloth-lora-r">LoRA Rank (r)</label>
              <select
                id="unsloth-lora-r"
                value={String(config.loraRank)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange("loraRank", Number(e.target.value))
                }
              >
                <option value="8">r = 8</option>
                <option value="16">r = 16 (Recommended)</option>
                <option value="32">r = 32</option>
                <option value="64">r = 64</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-lora-alpha">LoRA Alpha</label>
              <select
                id="unsloth-lora-alpha"
                value={String(config.loraAlpha)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange("loraAlpha", Number(e.target.value))
                }
              >
                <option value="16">16</option>
                <option value="32">32</option>
                <option value="64">64</option>
              </select>
            </div>

            <div className="form-field full-width">
              <span className="field-label">Target Linear Modules</span>
              <div className="chip-group">
                {ALL_PROJECTION_MODULES.map((mod) => {
                  const active = config.targetModules.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => handleToggleTargetModule(mod)}
                      className={active ? "chip-btn active" : "chip-btn"}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <hr className="section-divider" />

          <div className="section-header-row">
            <div>
              <h2 className="section-title">3. SFTTrainer Hyperparameters &amp; Export</h2>
              <p className="section-subtitle">
                Training loop settings. Execution is strictly manual via Colab; training is not
                started automatically.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="unsloth-batch-size">Per-Device Batch Size</label>
              <input
                id="unsloth-batch-size"
                type="number"
                min={1}
                max={32}
                value={config.perDeviceBatchSize}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange("perDeviceBatchSize", Number(e.target.value) || 1)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-grad-accum">Gradient Accumulation Steps</label>
              <input
                id="unsloth-grad-accum"
                type="number"
                min={1}
                max={64}
                value={config.gradientAccumulationSteps}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange("gradientAccumulationSteps", Number(e.target.value) || 1)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-lr">Learning Rate</label>
              <input
                id="unsloth-lr"
                type="text"
                value={config.learningRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange("learningRate", e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="unsloth-export-format">Target Export Format</label>
              <select
                id="unsloth-export-format"
                value={config.outputExportFormat}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handleFieldChange(
                    "outputExportFormat",
                    e.target.value as UnslothTrainingConfig["outputExportFormat"]
                  )
                }
              >
                <option value="lora_adapter">LoRA Adapter (Safetensors)</option>
                <option value="gguf_q4_k_m">GGUF (Q4_K_M Quantized)</option>
                <option value="merged_16bit">Merged 16-Bit Checkpoint</option>
              </select>
            </div>
          </div>

          <div className="form-footer">
            <button type="submit" className="btn-primary">
              Save Unsloth Configuration
            </button>
          </div>
        </form>

        <div className="hexa-card code-preview-card">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Generated Unsloth Specification</h2>
              <p className="section-subtitle">
                Synchronized Python specification for Manual Colab execution.
              </p>
            </div>
            <span className="status-badge badge-neutral">Non-Executing Preview</span>
          </div>
          <pre className="code-block">
            <code>{generatedPythonSnippet}</code>
          </pre>
          <div className="info-callout">
            <strong>Execution Guard:</strong> Training is never triggered automatically by the
            dashboard. Copy this specification into your Manual Colab Notebook when ready.
          </div>
        </div>
      </div>
    </div>
  );
};
