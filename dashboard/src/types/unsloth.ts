export interface UnslothTrainingConfig {
  baseModel: string;
  maxSeqLength: number;
  loadIn4Bit: boolean;
  dtype: "auto" | "float16" | "bfloat16";
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
  targetModules: string[];
  gradientCheckpointing: "unsloth" | "true" | "false";
  perDeviceBatchSize: number;
  gradientAccumulationSteps: number;
  learningRate: string;
  numTrainEpochs: number;
  optimizer: "adamw_8bit" | "adamw_torch" | "paged_adamw_8bit";
  lrSchedulerType: "linear" | "cosine" | "constant";
  warmupSteps: number;
  outputExportFormat: "lora_adapter" | "gguf_q4_k_m" | "merged_16bit";
}

export const DEFAULT_UNSLOTH_CONFIG: UnslothTrainingConfig = {
  baseModel: "unsloth/Llama-3.2-3B-Instruct-bnb-4bit",
  maxSeqLength: 2048,
  loadIn4Bit: true,
  dtype: "auto",
  loraRank: 16,
  loraAlpha: 16,
  loraDropout: 0,
  targetModules: [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
  ],
  gradientCheckpointing: "unsloth",
  perDeviceBatchSize: 2,
  gradientAccumulationSteps: 4,
  learningRate: "2e-4",
  numTrainEpochs: 1,
  optimizer: "adamw_8bit",
  lrSchedulerType: "linear",
  warmupSteps: 5,
  outputExportFormat: "lora_adapter",
};
