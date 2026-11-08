import crypto from "crypto";
import fs from "fs";
import path from "path";
import { encryptSecret, decryptSecret } from "../colab/crypto";

export type InfrastructureType =
  | "Local Server"
  | "VPS"
  | "Cloud Server"
  | "GPU Server"
  | "Dedicated Server"
  | "Compute Node"
  | "Other";

export const VALID_INFRA_TYPES: readonly InfrastructureType[] = [
  "Local Server",
  "VPS",
  "Cloud Server",
  "GPU Server",
  "Dedicated Server",
  "Compute Node",
  "Other",
];

export type InfrastructureEnvironment = "Development" | "Staging" | "Production";

export const VALID_INFRA_ENVIRONMENTS: readonly InfrastructureEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

export type InfrastructureStatus =
  | "Registered"
  | "Online"
  | "Offline"
  | "Maintenance";

export const VALID_INFRA_STATUSES: readonly InfrastructureStatus[] = [
  "Registered",
  "Online",
  "Offline",
  "Maintenance",
];

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

function getSafeInfraFilePath(): string {
  const baseDir = path.resolve(process.cwd());
  const cleanName = path.basename(".hexa-infrastructure.enc");
  const resolved = path.resolve(baseDir, cleanName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error("Security violation: Infrastructure store path escapes workspace boundary.");
  }
  return resolved;
}

function rejectSensitiveSecretPatterns(val: string, fieldName: string): void {
  const upper = val.toUpperCase();
  if (
    upper.includes("-----BEGIN") ||
    upper.includes("PRIVATE KEY") ||
    upper.includes("OPENSSH PRIVATE KEY")
  ) {
    throw new Error(
      `Security policy violation: ${fieldName} must not contain SSH private keys or cryptographic key blocks.`
    );
  }
}

function sanitizeField(val: unknown, fieldName: string, maxLen = 200, required = false): string {
  if (val === undefined || val === null) {
    if (required) {
      throw new Error(`${fieldName} is required.`);
    }
    return "";
  }
  if (typeof val !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  const trimmed = val.trim();
  if (required && !trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  if (trimmed.length > maxLen) {
    throw new Error(`${fieldName} must not exceed ${maxLen} characters.`);
  }
  rejectSensitiveSecretPatterns(trimmed, fieldName);
  return trimmed;
}

function loadInfraRaw(): InfrastructureRecord[] {
  const filePath = getSafeInfraFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const decrypted = decryptSecret(raw);
    const parsed = JSON.parse(decrypted);
    if (!Array.isArray(parsed)) return [];
    return parsed as InfrastructureRecord[];
  } catch {
    return [];
  }
}

function saveInfraRaw(records: InfrastructureRecord[]): void {
  const filePath = getSafeInfraFilePath();
  const encrypted = encryptSecret(JSON.stringify(records));
  fs.writeFileSync(filePath, encrypted, { encoding: "utf8", mode: 0o600 });
}

export function computeInfrastructureSummary(
  records: InfrastructureRecord[]
): InfrastructureSummary {
  const activeRecords = records.filter((r) => r.active);
  return {
    totalRegistered: records.length,
    onlineCount: activeRecords.filter((r) => r.status === "Online").length,
    offlineCount: activeRecords.filter((r) => r.status === "Offline").length,
    gpuEnabledCount: activeRecords.filter(
      (r) => r.type === "GPU Server" || Boolean(r.gpuModel.trim())
    ).length,
    activeComputeCount: activeRecords.length,
    maintenanceCount: activeRecords.filter((r) => r.status === "Maintenance").length,
  };
}

export function listInfrastructure(): {
  items: InfrastructureRecord[];
  summary: InfrastructureSummary;
} {
  const items = loadInfraRaw();
  return {
    items,
    summary: computeInfrastructureSummary(items),
  };
}

export function createInfrastructure(
  input: Record<string, unknown>
): InfrastructureRecord {
  const name = sanitizeField(input.name, "Server name", 120, true);
  const type = input.type as InfrastructureType;
  if (!VALID_INFRA_TYPES.includes(type)) {
    throw new Error("Invalid infrastructure type.");
  }

  const environment = (input.environment || "Development") as InfrastructureEnvironment;
  if (!VALID_INFRA_ENVIRONMENTS.includes(environment)) {
    throw new Error("Invalid infrastructure environment.");
  }

  // Default status is strictly "Registered" unless manually specified
  const status = (input.status || "Registered") as InfrastructureStatus;
  if (!VALID_INFRA_STATUSES.includes(status)) {
    throw new Error("Invalid infrastructure status.");
  }

  const provider = sanitizeField(input.provider, "Provider", 120, true);
  const hostnameOrIp = sanitizeField(input.hostnameOrIp, "Hostname or IP address", 160, true);
  const operatingSystem = sanitizeField(input.operatingSystem, "Operating system", 120, false);
  const cpuSpecs = sanitizeField(input.cpuSpecs, "CPU specifications", 120, false);
  const ramCapacity = sanitizeField(input.ramCapacity, "RAM capacity", 64, false);
  const gpuModel = sanitizeField(input.gpuModel, "GPU model", 120, false);
  const gpuVram = sanitizeField(input.gpuVram, "GPU VRAM", 64, false);
  const storageCapacity = sanitizeField(input.storageCapacity, "Storage capacity", 64, false);
  const region = sanitizeField(input.region, "Region / location", 120, false);
  const purpose = sanitizeField(input.purpose, "Purpose / workload", 200, false);
  const notes = sanitizeField(input.notes, "Notes", 500, false);

  const nowIso = new Date().toISOString();
  const record: InfrastructureRecord = {
    id: `inf_${crypto.randomBytes(8).toString("hex")}`,
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
    active: true,
    notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const items = loadInfraRaw();
  items.push(record);
  saveInfraRaw(items);
  return record;
}

export function updateInfrastructure(
  id: string,
  updates: Record<string, unknown>
): InfrastructureRecord {
  const items = loadInfraRaw();
  const idx = items.findIndex((r) => r.id === id);
  if (idx === -1) {
    throw new Error("Infrastructure entry not found.");
  }

  const current = { ...items[idx] };

  if (updates.name !== undefined) {
    current.name = sanitizeField(updates.name, "Server name", 120, true);
  }
  if (updates.type !== undefined) {
    const nextType = updates.type as InfrastructureType;
    if (!VALID_INFRA_TYPES.includes(nextType)) {
      throw new Error("Invalid infrastructure type.");
    }
    current.type = nextType;
  }
  if (updates.environment !== undefined) {
    const nextEnv = updates.environment as InfrastructureEnvironment;
    if (!VALID_INFRA_ENVIRONMENTS.includes(nextEnv)) {
      throw new Error("Invalid infrastructure environment.");
    }
    current.environment = nextEnv;
  }
  if (updates.status !== undefined) {
    const nextStatus = updates.status as InfrastructureStatus;
    if (!VALID_INFRA_STATUSES.includes(nextStatus)) {
      throw new Error("Invalid infrastructure status.");
    }
    current.status = nextStatus;
  }
  if (updates.provider !== undefined) {
    current.provider = sanitizeField(updates.provider, "Provider", 120, true);
  }
  if (updates.hostnameOrIp !== undefined) {
    current.hostnameOrIp = sanitizeField(
      updates.hostnameOrIp,
      "Hostname or IP address",
      160,
      true
    );
  }
  if (updates.operatingSystem !== undefined) {
    current.operatingSystem = sanitizeField(
      updates.operatingSystem,
      "Operating system",
      120,
      false
    );
  }
  if (updates.cpuSpecs !== undefined) {
    current.cpuSpecs = sanitizeField(updates.cpuSpecs, "CPU specifications", 120, false);
  }
  if (updates.ramCapacity !== undefined) {
    current.ramCapacity = sanitizeField(updates.ramCapacity, "RAM capacity", 64, false);
  }
  if (updates.gpuModel !== undefined) {
    current.gpuModel = sanitizeField(updates.gpuModel, "GPU model", 120, false);
  }
  if (updates.gpuVram !== undefined) {
    current.gpuVram = sanitizeField(updates.gpuVram, "GPU VRAM", 64, false);
  }
  if (updates.storageCapacity !== undefined) {
    current.storageCapacity = sanitizeField(
      updates.storageCapacity,
      "Storage capacity",
      64,
      false
    );
  }
  if (updates.region !== undefined) {
    current.region = sanitizeField(updates.region, "Region / location", 120, false);
  }
  if (updates.purpose !== undefined) {
    current.purpose = sanitizeField(updates.purpose, "Purpose / workload", 200, false);
  }
  if (updates.notes !== undefined) {
    current.notes = sanitizeField(updates.notes, "Notes", 500, false);
  }
  if (updates.active !== undefined) {
    current.active = Boolean(updates.active);
    if (!current.active && current.status === "Online") {
      current.status = "Offline";
    }
  }

  current.updatedAt = new Date().toISOString();
  items[idx] = current;
  saveInfraRaw(items);
  return current;
}

