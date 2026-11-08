import crypto from "crypto";

/**
 * Explicit, documented scrypt parameters following OWASP Password Storage Cheat Sheet
 * and the PHC String Format specification:
 *   $scrypt$ln=<log2(N)>,r=<r>,p=<p>$<salt-base64-nopad>$<hash-base64-nopad>
 *
 * Parameters:
 * - Algorithm: Node.js native crypto.scryptSync (RFC 7914)
 * - ln = 14 -> N = 2^14 = 16384 (CPU/memory cost parameter)
 * - r = 8 (block size parameter)
 * - p = 1 (parallelization parameter)
 * - Salt length = 16 bytes (128 bits from OS CSPRNG crypto.randomBytes)
 * - Derived key length = 64 bytes (512 bits)
 * - Max memory = 32 MiB (128 * N * r = 16 MiB working memory)
 */
export const SCRYPT_PARAMS = {
  algorithm: "scrypt",
  ln: 14,
  N: 16384, // 2^14
  r: 8,
  p: 1,
  saltBytes: 16,
  keyLen: 64,
  maxmem: 32 * 1024 * 1024,
} as const;

const BASE64_NOPAD_REGEX = /^[A-Za-z0-9+/]+$/;

function toBase64NoPad(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "");
}

function fromBase64Strict(b64NoPad: string): Buffer | null {
  if (!b64NoPad || !BASE64_NOPAD_REGEX.test(b64NoPad)) {
    return null;
  }
  // Remainder 1 is never valid in Base64 encoding
  if (b64NoPad.length % 4 === 1) {
    return null;
  }
  const padLen = (4 - (b64NoPad.length % 4)) % 4;
  const padded = b64NoPad + "=".repeat(padLen);
  const decoded = Buffer.from(padded, "base64");
  if (toBase64NoPad(decoded) !== b64NoPad) {
    return null;
  }
  return decoded;
}

// Legacy base64 alphabet used only for backward-compatibility verification of pre-migration accounts
const LEGACY_RADIX64_ALPHABET =
  "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function encodeLegacyRadix64(buf: Buffer, len: number): string {
  let out = "";
  let off = 0;
  while (off < len) {
    const c1 = buf[off++] & 0xff;
    out += LEGACY_RADIX64_ALPHABET[(c1 >> 2) & 0x3f];
    let c2 = (c1 & 0x03) << 4;
    if (off >= len) {
      out += LEGACY_RADIX64_ALPHABET[c2 & 0x3f];
      break;
    }
    const b2 = buf[off++] & 0xff;
    c2 |= (b2 >> 4) & 0x0f;
    out += LEGACY_RADIX64_ALPHABET[c2 & 0x3f];
    let c3 = (b2 & 0x0f) << 2;
    if (off >= len) {
      out += LEGACY_RADIX64_ALPHABET[c3 & 0x3f];
      break;
    }
    const b3 = buf[off++] & 0xff;
    c3 |= (b3 >> 6) & 0x03;
    out += LEGACY_RADIX64_ALPHABET[c3 & 0x3f];
    out += LEGACY_RADIX64_ALPHABET[b3 & 0x3f];
  }
  return out;
}

function decodeLegacyRadix64(str: string, maxBytes: number): Buffer {
  const out: number[] = [];
  let off = 0;
  while (off < str.length && out.length < maxBytes) {
    const c1 = LEGACY_RADIX64_ALPHABET.indexOf(str[off++]);
    const c2 = off < str.length ? LEGACY_RADIX64_ALPHABET.indexOf(str[off++]) : -1;
    if (c1 < 0 || c2 < 0) break;
    out.push(((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff);
    if (out.length >= maxBytes || off >= str.length) break;
    const c3 = LEGACY_RADIX64_ALPHABET.indexOf(str[off++]);
    if (c3 < 0) break;
    out.push((((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff);
    if (out.length >= maxBytes || off >= str.length) break;
    const c4 = off < str.length ? LEGACY_RADIX64_ALPHABET.indexOf(str[off++]) : -1;
    if (c4 < 0) break;
    out.push((((c3 & 0x03) << 6) | c4) & 0xff);
  }
  return Buffer.from(out.slice(0, maxBytes));
}

/**
 * Validates password strength per OWASP guidelines:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - Allows all printable and special characters
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
 * Hashes a password using Node.js native `crypto.scryptSync` and encodes it in
 * standard PHC scrypt string format:
 *   $scrypt$ln=14,r=8,p=1$<base64-salt>$<base64-derived-key>
 */
export function hashPassword(password: string): string {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.error || "Invalid password");
  }

  const salt = crypto.randomBytes(SCRYPT_PARAMS.saltBytes);
  const derivedKey = crypto.scryptSync(
    Buffer.from(password, "utf8"),
    salt,
    SCRYPT_PARAMS.keyLen,
    {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_PARAMS.maxmem,
    }
  );

  const saltB64 = toBase64NoPad(salt);
  const hashB64 = toBase64NoPad(derivedKey);
  return `$scrypt$ln=${SCRYPT_PARAMS.ln},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${saltB64}$${hashB64}`;
}

/**
 * Verifies a legacy pre-migration `$2b$`-prefixed scrypt record in constant time
 * so existing stored user accounts remain compatible and can be transparently
 * upgraded to `$scrypt$ln=14,r=8,p=1$...` upon login.
 */
function verifyLegacyPrefixedHash(password: string, storedHash: string): boolean {
  if (storedHash.length !== 60 || storedHash[6] !== "$") {
    return false;
  }
  const costStr = storedHash.slice(4, 6);
  if (!/^\d{2}$/.test(costStr)) {
    return false;
  }
  const cost = parseInt(costStr, 10);
  if (Number.isNaN(cost) || cost < 10 || cost > 14) {
    return false;
  }
  const saltPart = storedHash.slice(7, 29);
  const expectedHashPart = storedHash.slice(29, 60);
  const saltBytes = decodeLegacyRadix64(saltPart, 16);
  if (saltBytes.length !== 16) {
    return false;
  }

  try {
    const N = 1 << cost;
    const derived = crypto.scryptSync(Buffer.from(password, "utf8"), saltBytes, 23, {
      N,
      r: 8,
      p: 1,
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    const candidateHashPart = encodeLegacyRadix64(derived, 23);
    const bufA = Buffer.from(candidateHashPart, "utf8");
    const bufB = Buffer.from(expectedHashPart, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verifies a candidate password against a stored hash in constant time.
 * Supports:
 * 1. Canonical PHC `$scrypt$ln=14,r=8,p=1$<salt>$<hash>` format.
 * 2. Legacy pre-migration `$2b$`-prefixed scrypt records (for seamless account migration).
 * Safely rejects any malformed or unsupported hash strings without throwing.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128 ||
    typeof storedHash !== "string" ||
    storedHash.length === 0 ||
    storedHash.length > 512
  ) {
    return false;
  }

  // Backward compatibility path for pre-migration stored records
  if (storedHash.startsWith("$2b$")) {
    return verifyLegacyPrefixedHash(password, storedHash);
  }

  if (!storedHash.startsWith("$scrypt$")) {
    return false;
  }

  const parts = storedHash.split("$");
  // Expected: ["", "scrypt", "ln=14,r=8,p=1", "<saltB64>", "<hashB64>"]
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "scrypt") {
    return false;
  }

  const paramPart = parts[2];
  const saltB64 = parts[3];
  const hashB64 = parts[4];

  const paramMatch = /^ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})$/.exec(paramPart);
  if (!paramMatch) {
    return false;
  }

  const ln = parseInt(paramMatch[1], 10);
  const r = parseInt(paramMatch[2], 10);
  const p = parseInt(paramMatch[3], 10);

  if (
    Number.isNaN(ln) ||
    Number.isNaN(r) ||
    Number.isNaN(p) ||
    ln < 10 ||
    ln > 16 ||
    r < 1 ||
    r > 16 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }

  const N = 1 << ln;
  const requiredMem = 128 * N * r * p;
  if (requiredMem > 64 * 1024 * 1024) {
    return false;
  }

  const saltBytes = fromBase64Strict(saltB64);
  const expectedKey = fromBase64Strict(hashB64);

  if (
    !saltBytes ||
    !expectedKey ||
    saltBytes.length < 16 ||
    saltBytes.length > 64 ||
    expectedKey.length < 32 ||
    expectedKey.length > 128
  ) {
    return false;
  }

  try {
    const candidateKey = crypto.scryptSync(
      Buffer.from(password, "utf8"),
      saltBytes,
      expectedKey.length,
      {
        N,
        r,
        p,
        maxmem: 64 * 1024 * 1024,
      }
    );

    if (candidateKey.length !== expectedKey.length) {
      return false;
    }
    return crypto.timingSafeEqual(candidateKey, expectedKey);
  } catch {
    return false;
  }
}

/**
 * Returns true if the stored hash uses a legacy format or outdated scrypt cost parameters
 * and should be transparently re-hashed to the current canonical `$scrypt$ln=14,r=8,p=1$...`
 * format after a successful password verification.
 */
export function needsPasswordRehash(storedHash: string): boolean {
  if (typeof storedHash !== "string") {
    return true;
  }
  const canonicalPrefix = `$scrypt$ln=${SCRYPT_PARAMS.ln},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$`;
  if (!storedHash.startsWith(canonicalPrefix)) {
    return true;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 5) {
    return true;
  }
  const saltBytes = fromBase64Strict(parts[3]);
  const keyBytes = fromBase64Strict(parts[4]);
  if (
    !saltBytes ||
    !keyBytes ||
    saltBytes.length !== SCRYPT_PARAMS.saltBytes ||
    keyBytes.length !== SCRYPT_PARAMS.keyLen
  ) {
    return true;
  }
  return false;
}

/**
 * Helper used ONLY in automated tests to construct a pre-migration legacy hash
 * and verify backward compatibility + automatic migration on login.
 */
export function createLegacyPrefixedHashForTest(password: string, cost = 12): string {
  const saltBytes = crypto.randomBytes(16);
  const saltPart = encodeLegacyRadix64(saltBytes, 16);
  const N = 1 << Math.min(14, Math.max(10, cost));
  const derived = crypto.scryptSync(Buffer.from(password, "utf8"), saltBytes, 23, {
    N,
    r: 8,
    p: 1,
  });
  const hashPart = encodeLegacyRadix64(derived, 23);
  const costStr = String(cost).padStart(2, "0");
  return `$2b$${costStr}$${saltPart}${hashPart}`;
}
