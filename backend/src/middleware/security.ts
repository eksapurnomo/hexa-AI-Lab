import crypto from "crypto";
import fs from "fs";
import { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { PublicUserRecord, UserRole, validateSessionToken } from "../auth/users";

const EPHEMERAL_ADMIN_TOKEN = crypto.randomBytes(32).toString("hex");
const EPHEMERAL_CSRF_TOKEN = crypto.randomBytes(32).toString("hex");
let loggedAdminWarning = false;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const loginAttemptStore = new Map<string, { failures: number; windowStart: number }>();
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_FAILURES = 5;

const preAuthCsrfStore = new Map<string, number>();
const PRE_AUTH_CSRF_TTL_MS = 15 * 60_000;

export interface AuthenticatedActor {
  authType: "session" | "admin_token";
  user: PublicUserRecord;
  csrfToken: string;
  sessionId: string | null;
}

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

export function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  const result: Record<string, string> = {};
  if (!header) return result;
  const pairs = header.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function issuePreAuthCsrfToken(res: ServerResponse): string {
  const now = Date.now();
  for (const [tok, exp] of preAuthCsrfStore.entries()) {
    if (exp <= now) preAuthCsrfStore.delete(tok);
  }
  const token = crypto.randomBytes(32).toString("hex");
  preAuthCsrfStore.set(token, now + PRE_AUTH_CSRF_TTL_MS);
  res.setHeader("Set-Cookie", [
    `__Host-hexa_csrf=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900`,
    `hexa_csrf=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`,
  ]);
  return token;
}

export function verifyPreAuthCsrfToken(req: IncomingMessage): boolean {
  const header = req.headers["x-csrf-token"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided) return false;

  // Allow test suite static CSRF token or issued pre-auth CSRF token
  if (safeCompare(provided, getActiveCsrfToken())) {
    return true;
  }

  const now = Date.now();
  const exp = preAuthCsrfStore.get(provided);
  if (!exp || exp <= now) {
    return false;
  }

  const cookies = parseCookies(req);
  const cookieToken = cookies["__Host-hexa_csrf"] || cookies["hexa_csrf"];
  if (cookieToken && !safeCompare(provided, cookieToken)) {
    return false;
  }
  return true;
}

export function setSessionCookies(res: ServerResponse, sessionId: string): void {
  const maxAge = 8 * 60 * 60;
  res.setHeader("Set-Cookie", [
    `__Host-hexa_session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
    `hexa_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`,
  ]);
}

export function clearSessionCookies(res: ServerResponse): void {
  res.setHeader("Set-Cookie", [
    "__Host-hexa_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    "hexa_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  ]);
}

/**
 * Applies mandatory secure HTTP headers and strict CORS policy.
 */
export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:3001 http://localhost:3001 http://127.0.0.1:4173 http://localhost:4173; object-src 'none'; frame-ancestors 'none';"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Hexa-Admin-Token, X-CSRF-Token"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Enforces general per-IP rate limiting.
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

export function resetRateLimitsForTest(): void {
  rateLimitStore.clear();
  loginAttemptStore.clear();
}

/**
 * Enforces strict login brute-force rate limiting per IP + username.
 */
export function checkLoginRateLimit(req: IncomingMessage, username: string): boolean {
  const clientIp = req.socket.remoteAddress || "127.0.0.1";
  const key = `${clientIp}:${(username || "").toLowerCase()}`;
  const now = Date.now();
  const entry = loginAttemptStore.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    return true;
  }
  return entry.failures < LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(req: IncomingMessage, username: string): void {
  const clientIp = req.socket.remoteAddress || "127.0.0.1";
  const key = `${clientIp}:${(username || "").toLowerCase()}`;
  const now = Date.now();
  const entry = loginAttemptStore.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttemptStore.set(key, { failures: 1, windowStart: now });
  } else {
    entry.failures += 1;
  }
}

export function clearLoginFailures(req: IncomingMessage, username: string): void {
  const clientIp = req.socket.remoteAddress || "127.0.0.1";
  const key = `${clientIp}:${(username || "").toLowerCase()}`;
  loginAttemptStore.delete(key);
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
 * Verifies CSRF token on state-changing requests (POST) for Admin-Token requests.
 */
export function verifyCsrfRequest(req: IncomingMessage): boolean {
  const csrfHeader = req.headers["x-csrf-token"];
  const provided = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  if (!provided) return false;
  return safeCompare(provided, getActiveCsrfToken());
}

/**
 * Resolves the authenticated user from either an HttpOnly session cookie
 * or the server-side Administrator API Token.
 */
export function resolveAuthenticatedActor(req: IncomingMessage): AuthenticatedActor | null {
  const cookies = parseCookies(req);
  const sessionId = cookies["__Host-hexa_session"] || cookies["hexa_session"];
  if (sessionId) {
    const validated = validateSessionToken(sessionId);
    if (validated) {
      return {
        authType: "session",
        user: validated.user,
        csrfToken: validated.session.csrfToken,
        sessionId: validated.session.sessionId,
      };
    }
  }

  if (verifyAdminRequest(req)) {
    return {
      authType: "admin_token",
      user: {
        id: "admin_token_actor",
        username: "admin",
        displayName: "System Administrator",
        role: "Admin",
        active: true,
        createdAt: new Date(0).toISOString(),
        lastLoginAt: null,
      },
      csrfToken: getActiveCsrfToken(),
      sessionId: null,
    };
  }

  return null;
}

export function verifyActorCsrf(req: IncomingMessage, actor: AuthenticatedActor): boolean {
  const csrfHeader = req.headers["x-csrf-token"];
  const provided = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
  if (!provided) return false;
  return safeCompare(provided, actor.csrfToken);
}

export function hasRequiredRole(
  actor: AuthenticatedActor | null,
  allowedRoles: readonly UserRole[]
): boolean {
  if (!actor || !actor.user.active) return false;
  return allowedRoles.includes(actor.user.role);
}
