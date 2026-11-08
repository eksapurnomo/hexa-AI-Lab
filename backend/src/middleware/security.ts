import crypto from "crypto";
import fs from "fs";
import http, { IncomingMessage, ServerResponse } from "http";
import path from "path";

const EPHEMERAL_ADMIN_TOKEN = crypto.randomBytes(32).toString("hex");
const EPHEMERAL_CSRF_TOKEN = crypto.randomBytes(32).toString("hex");
let loggedAdminWarning = false;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * Multi-tiered resolution for the administrator API token.
 */
export function getAdminApiToken(): string {
  if (process.env.ADMIN_API_TOKEN && process.env.ADMIN_API_TOKEN.trim().length >= 16) {
    return process.env.ADMIN_API_TOKEN.trim();
  }
  const tokenFile = path.resolve(process.cwd(), ".admin_token.secret");
  if (fs.existsSync(tokenFile)) {
    const fileVal = fs.readFileSync(tokenFile, "utf8").trim();
    if (fileVal.length >= 16) return fileVal;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL: ADMIN_API_TOKEN must be configured in production.");
  }
  if (!loggedAdminWarning) {
    console.warn("[Security] Generating ephemeral admin token. Instance-isolated!");
    loggedAdminWarning = true;
  }
  return EPHEMERAL_ADMIN_TOKEN;
}

export function getActiveCsrfToken(): string {
  return EPHEMERAL_CSRF_TOKEN;
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Applies mandatory secure HTTP headers and strict CORS policy.
 */
export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none';"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Hexa-Admin-Token, X-CSRF-Token");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Enforces per-IP rate limiting.
 */
export function checkRateLimit(req: IncomingMessage): boolean {
  const clientIp = req.socket.remoteAddress || "127.0.0.1";
  const now = Date.now();
  const entry = rateLimitStore.get(clientIp);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientIp, { count: 1, windowStart: now });
    return true;
  }

  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Verifies Administrator authorization header.
 */
export function verifyAdminRequest(req: IncomingMessage): boolean {
  const headerToken = req.headers["x-hexa-admin-token"];
  const provided = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!provided) return false;
  return safeCompare(provided, getAdminApiToken());
}

/**
 * Verifies CSRF token on state-changing requests (POST).
 */
export function verifyCsrfRequest(req: IncomingMessage): boolean {
  const csrfHeader = req.headers["x-csrf-token"];
  const provided = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  if (!provided) return false;
  return safeCompare(provided, getActiveCsrfToken());
}
