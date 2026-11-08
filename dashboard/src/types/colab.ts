export type DashboardModuleId =
  | "overview"
  | "datasets"
  | "unsloth"
  | "jobs"
  | "evaluation"
  | "models"
  | "colab"
  | "infrastructure"
  | "team"
  | "settings";

export type UserRole =
  | "Admin"
  | "ML Engineer"
  | "Dataset Contributor"
  | "Reviewer";

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export type InfrastructureType =
  | "Local Server"
  | "VPS"
  | "Cloud Server"
  | "GPU Server"
  | "Dedicated Server"
  | "Compute Node"
  | "Other";

export type InfrastructureEnvironment = "Development" | "Staging" | "Production";

export type InfrastructureStatus =
  | "Registered"
  | "Online"
  | "Offline"
  | "Maintenance";

export interface InfrastructureRecord {
  id: string;
  name: string;
  type: InfrastructureType;
  provider: string;
  environment: InfrastructureEnvironment;
  hostnameOrIp: string;
  operatingSystem: string;
  cpuSpecs: string;
  ramCapacity: string;
  gpuModel: string;
  gpuVram: string;
  storageCapacity: string;
  region: string;
  purpose: string;
  status: InfrastructureStatus;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InfrastructureSummary {
  totalRegistered: number;
  onlineCount: number;
  offlineCount: number;
  gpuEnabledCount: number;
  activeComputeCount: number;
  maintenanceCount: number;
}

export interface NavItem {
  id: DashboardModuleId;
  label: string;
  category: "Core Workspace" | "ML Pipeline" | "Infrastructure & Admin";
  statusBadge?: string;
  adminOnly?: boolean;
}

export interface RuntimeKey {
  variant: "VARIANT_UNSPECIFIED" | "VARIANT_CPU" | "VARIANT_GPU" | "VARIANT_TPU" | string;
  shape: "SHAPE_UNSPECIFIED" | "SHAPE_STANDARD" | "SHAPE_HIGHMEM" | string;
  accelerator: string;
}

export interface RuntimeSpec {
  key: RuntimeKey;
  eligible: boolean;
}

export interface ColabStatusResponse {
  activeMode: "MANUAL" | "OAUTH_DISABLED";
  oauthEnabled: boolean;
  gcpAppealStatus: "PENDING" | "APPROVED";
  googleConnectionStatus: string;
  oauthClientIdStatus: "CONFIGURED" | "NOT_CONFIGURED";
  clientIdMasked: string;
  hasClientSecret: boolean;
  clientSecretMasked: string;
  refreshTokenStatus: "STORED_ENCRYPTED" | "NOT_CONFIGURED";
  colabApiConnectionStatus: string;
  subscriptionTier: string;
  runtimeEligibility: boolean;
  projectId: string | null;
  scopes: string;
  colabApiBaseUrl: string;
  colabApiVersion: string;
  colabOperationsVersion: string;
  manualNotebookUrl: string | null;
  manualTunnelMasked: string;
  redirectUri: string;
  lastUpdated: string | null;
  lastTested: string | null;
}

export interface VerificationStep {
  step: string;
  status: "PASS" | "SKIPPED" | "ERROR";
  detail: string;
}

export interface VerificationResult {
  success: boolean;
  mode: "MANUAL_MOCKED" | "LIVE_OAUTH";
  oauthStatus: "DISABLED_PENDING_GCP_APPEAL" | "ENABLED";
  testedAt: string;
  subscription: {
    name: string;
    tier: string;
  };
  runtimeEligibility: boolean;
  runtimeSpecs: RuntimeSpec[];
  steps: VerificationStep[];
  error?: string;
}
