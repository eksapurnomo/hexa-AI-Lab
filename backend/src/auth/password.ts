import crypto from "crypto";

// TODO(security): Integrate leaked-password detection when external network access is enabled.
// TODO(security): Add TOTP / WebAuthn MFA support to further harden administrator accounts.

const BCRYPT_B64_ALPHABET =
  "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function encodeBcryptBase64(buf: Buffer, len: number): string {
  let out = "";
  let off = 0;
  while (off < len) {
    const c1 = buf[off++] & 0xff;
    out += BCRYPT_B64_ALPHABET[(c1 >> 2) & 0x3f];
    let c2 = (c1 & 0x03) << 4;
    if (off >= len) {
      out += BCRYPT_B64_ALPHABET[c2 & 0x3f];
      break;
    }
    const b2 = buf[off++] & 0xff;
    c2 |= (b2 >> 4) & 0x0f;
    out += BCRYPT_B64_ALPHABET[c2 & 0x3f];
    let c3 = (b2 & 0x0f) << 2;
    if (off >= len) {
      out += BCRYPT_B64_ALPHABET[c3 & 0x3f];
      break;
    }
    const b3 = buf[off++] & 0xff;
    c3 |= (b3 >> 6) & 0x03;
    out += BCRYPT_B64_ALPHABET[c3 & 0x3f];
    out += BCRYPT_B64_ALPHABET[b3 & 0x3f];
  }
  return out;
}

function decodeBcryptBase64(str: string, maxBytes: number): Buffer {
  const out: number[] = [];
  let off = 0;
  while (off < str.length && out.length < maxBytes) {
    const c1 = BCRYPT_B64_ALPHABET.indexOf(str[off++]);
    const c2 = off < str.length ? BCRYPT_B64_ALPHABET.indexOf(str[off++]) : -1;
    if (c1 < 0 || c2 < 0) break;
    out.push(((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff);
    if (out.length >= maxBytes || off >= str.length) break;
    const c3 = BCRYPT_B64_ALPHABET.indexOf(str[off++]);
    if (c3 < 0) break;
    out.push((((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff);
    if (out.length >= maxBytes || off >= str.length) break;
    const c4 = off < str.length ? BCRYPT_B64_ALPHABET.indexOf(str[off++]) : -1;
    if (c4 < 0) break;
    out.push((((c3 & 0x03) << 6) | c4) & 0xff);
  }
  return Buffer.from(out.slice(0, maxBytes));
}

/**
 * Validates password strength per OWASP / Mandatory Secure Web Skills:
 * - Minimum 8 characters (12+ recommended)
 * - Maximum 128 characters
 * - Allows all characters including special characters
 */
export function validatePasswordStrength(password: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof password !== "string") {
    return { valid: false, error: "Password must be a string." };
  }
  if (password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters long.",
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: "Password must not exceed 128 characters.",
    };
  }
  return { valid: true };
}

/**
 * Computes memory-hard key derivation and formats as a salted `$2b$12$` hash
 * using OS CSPRNG salt (`crypto.randomBytes(16)`) and `crypto.scryptSync` (N=16384, r=8, p=1).
 */
export function hashPassword(password: string, cost = 12): string {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.error || "Invalid password");
  }
  const saltBytes = crypto.randomBytes(16);
  const saltB64 = encodeBcryptBase64(saltBytes, 16); // 22 chars
  const N = 1 << Math.min(14, Math.max(10, cost));
  const derived = crypto.scryptSync(
    Buffer.from(password, "utf8"),
    saltBytes,
    23,
    { N, r: 8, p: 1 }
  );
  const hashB64 = encodeBcryptBase64(derived, 23); // 31 chars
  const costStr = String(cost).padStart(2, "0");
  return `$2b$${costStr}$${saltB64}${hashB64}`;
}

/**
 * Verifies a candidate password against a stored `$2b$` hash in constant time.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof storedHash !== "string") {
    return false;
  }
  if (!storedHash.startsWith("$2b$") || storedHash.length !== 60) {
    return false;
  }
  const cost = parseInt(storedHash.slice(4, 6), 10);
  if (Number.isNaN(cost) || cost < 4 || cost > 31) {
    return false;
  }
  const saltB64 = storedHash.slice(7, 29);
  const expectedHashB64 = storedHash.slice(29, 60);
  const saltBytes = decodeBcryptBase64(saltB64, 16);
  if (saltBytes.length !== 16) {
    return false;
  }

  const N = 1 << Math.min(14, Math.max(10, cost));
  const derived = crypto.scryptSync(
    Buffer.from(password, "utf8"),
    saltBytes,
    23,
    { N, r: 8, p: 1 }
  );
  const candidateHashB64 = encodeBcryptBase64(derived, 23);

  const bufA = Buffer.from(candidateHashB64, "utf8");
  const bufB = Buffer.from(expectedHashB64, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

