import crypto from "crypto";
import fs from "fs";
import path from "path";

const EPHEMERAL_MASTER_KEY = crypto.randomBytes(32).toString("hex");
let loggedEphemeralWarning = false;

/**
 * Multi-tiered secret resolution (Environment -> Local Secret File -> Ephemeral Random Gen).
 * Never uses a hardcoded literal fallback.
 */
function resolveMasterSecret(): string {
  if (process.env.ENCRYPTION_MASTER_KEY && process.env.ENCRYPTION_MASTER_KEY.trim().length >= 32) {
    return process.env.ENCRYPTION_MASTER_KEY.trim();
  }

  const secretFilePath = path.resolve(process.cwd(), ".master_key.secret");
  if (fs.existsSync(secretFilePath)) {
    const fileSecret = fs.readFileSync(secretFilePath, "utf8").trim();
    if (fileSecret.length >= 32) {
      return fileSecret;
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL: ENCRYPTION_MASTER_KEY must be set in production environment.");
  }

  if (!loggedEphemeralWarning) {
    console.warn("[Security] Generating ephemeral master encryption secret. Instance-isolated!");
    loggedEphemeralWarning = true;
  }
  return EPHEMERAL_MASTER_KEY;
}

function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(masterSecret, salt, 32);
}

/**
 * Encrypts plaintext using authenticated AES-256-GCM.
 * Format: saltHex:ivHex:authTagHex:ciphertextHex
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const masterSecret = resolveMasterSecret();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(masterSecret, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return [
    salt.toString("hex"),
    iv.toString("hex"),
    authTag,
    encrypted,
  ].join(":");
}

/**
 * Decrypts an AES-256-GCM payload produced by encryptSecret.
 */
export function decryptSecret(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted payload format");
  }

  const [saltHex, ivHex, authTagHex, ciphertextHex] = parts;
  const masterSecret = resolveMasterSecret();
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = deriveKey(masterSecret, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Masks sensitive strings so full values are never displayed after saving.
 */
export function maskSecretValue(value: string | undefined | null, visibleSuffix = 4): string {
  if (!value || value.trim().length === 0) {
    return "Not Configured";
  }
  const clean = value.trim();
  if (clean.length <= visibleSuffix) {
    return "****";
  }
  return `************${clean.slice(-visibleSuffix)}`;
}

