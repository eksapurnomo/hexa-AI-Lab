import fs from "fs";
import path from "path";
import { encryptSecret, decryptSecret } from "./crypto";

export type ColabIntegrationMode = "MANUAL" | "OAUTH_DISABLED";

export interface ColabStoredCredentials {
  activeMode: ColabIntegrationMode;
  oauthEnabled: boolean;
  gcpAppealStatus: "PENDING" | "APPROVED";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  projectId: string;
  scopes: string;
  colabApiBaseUrl: string;
  colabApiVersion: string;
  colabOperationsVersion: string;
  datasetFolderId: string;
  checkpointFolderId: string;
  modelFolderId: string;
  manualNotebookUrl: string;
  manualTunnelEndpoint: string;
  simulatedSubscriptionTier: string;
  lastUpdated: string | null;
  lastTested: string | null;
}

const DEFAULT_CONFIG: ColabStoredCredentials = {
  activeMode: "MANUAL",
  oauthEnabled: false,
  gcpAppealStatus: "PENDING",
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "",
  scopes: process.env.GOOGLE_OAUTH_SCOPES || "https://www.googleapis.com/auth/colaboratory",
  colabApiBaseUrl: process.env.COLAB_API_BASE_URL || "https://colaboratory.googleapis.com",
  colabApiVersion: process.env.COLAB_API_VERSION || "v1beta",
  colabOperationsVersion: process.env.COLAB_OPERATIONS_VERSION || "v1",
  datasetFolderId: process.env.GOOGLE_DRIVE_DATASET_FOLDER_ID || "",
  checkpointFolderId: process.env.GOOGLE_DRIVE_CHECKPOINT_FOLDER_ID || "",
  modelFolderId: process.env.GOOGLE_DRIVE_MODEL_FOLDER_ID || "",
  manualNotebookUrl: "",
  manualTunnelEndpoint: "",
  simulatedSubscriptionTier: "TIER_PRO",
  lastUpdated: null,
  lastTested: null,
};

function getSafeStoreFilePath(): string {
  const baseDir = path.resolve(process.cwd());
  const filename = path.basename(".colab-credentials.enc");
  const resolvedPath = path.resolve(baseDir, filename);

  if (!resolvedPath.startsWith(baseDir + path.sep)) {
    throw new Error("Security violation: Credential store path escapes workspace boundary.");
  }
  return resolvedPath;
}

/**
 * Loads the Colab configuration from the AES-256-GCM encrypted store or defaults.
 */
export function loadColabCredentials(): ColabStoredCredentials {
  const storePath = getSafeStoreFilePath();
  if (!fs.existsSync(storePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(storePath, "utf8").trim();
    if (!raw) {
      return { ...DEFAULT_CONFIG };
    }
    const decrypted = decryptSecret(raw);
    const parsed = JSON.parse(decrypted) as Partial<ColabStoredCredentials>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Enforce that OAuth stays disabled while GCP appeal is pending unless explicitly enabled by env
      oauthEnabled: process.env.GOOGLE_OAUTH_ENABLED === "true" ? Boolean(parsed.oauthEnabled) : false,
      activeMode: parsed.activeMode || "MANUAL",
    };
  } catch {
    console.warn("[ColabStorage] Unable to decrypt existing store; using safe default configuration.");
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Saves updated Colab credentials encrypted with AES-256-GCM.
 */
export function saveColabCredentials(
  updates: Partial<ColabStoredCredentials>
): ColabStoredCredentials {
  const current = loadColabCredentials();
  const nextState: ColabStoredCredentials = {
    ...current,
    ...updates,
    // Keep OAuth disabled while Google Cloud appeal is pending
    oauthEnabled: process.env.GOOGLE_OAUTH_ENABLED === "true" ? Boolean(updates.oauthEnabled ?? current.oauthEnabled) : false,
    lastUpdated: new Date().toISOString(),
  };

  const storePath = getSafeStoreFilePath();
  const serialized = JSON.stringify(nextState);
  const encrypted = encryptSecret(serialized);

  fs.writeFileSync(storePath, encrypted, { encoding: "utf8", mode: 0o600 });
  return nextState;
}

/**
 * Clears stored sensitive tokens while keeping non-secret configuration.
 */
export function clearStoredTokens(): ColabStoredCredentials {
  return saveColabCredentials({
    refreshToken: "",
    manualTunnelEndpoint: "",
  });
}

