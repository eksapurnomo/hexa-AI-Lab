import fs from "fs";
import http, { IncomingMessage, ServerResponse, Server } from "http";
import path from "path";
import { URL } from "url";
import { maskSecretValue } from "./colab/crypto";
import {
  loadColabCredentials,
  saveColabCredentials,
  clearStoredTokens,
} from "./colab/storage";
import {
  isOAuthEnabled,
  generateOAuthCsrfState,
  buildGoogleOAuthUrl,
  OAuthDisabledError,
} from "./colab/oauth";
import { runNonDestructiveVerification } from "./colab/client";
import {
  ensureBootstrapAdmin,
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  authenticateUserSession,
  invalidateSession,
  UserRole,
} from "./auth/users";
import {
  listInfrastructure,
  createInfrastructure,
  updateInfrastructure,
} from "./infra/storage";
import {
  applySecurityHeaders,
  checkRateLimit,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  parseCookies,
  issuePreAuthCsrfToken,
  verifyPreAuthCsrfToken,
  setSessionCookies,
  clearSessionCookies,
  resolveAuthenticatedActor,
  verifyActorCsrf,
  hasRequiredRole,
} from "./middleware/security";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);
const MAX_BODY_BYTES = 16 * 1024; // 16 KB limit

const STATIC_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;

    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      raw += chunk.toString("utf8");
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          reject(new Error("Invalid JSON object"));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error("Malformed JSON payload"));
      }
    });

    req.on("error", reject);
  });
}

function sanitizeStringInput(val: unknown, maxLength = 256): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength} characters.`);
  }
  return trimmed;
}

function tryServeDashboardStatic(pathname: string, res: ServerResponse): boolean {
  const distDir = path.resolve(__dirname, "../../dashboard/dist");
  if (!fs.existsSync(distDir)) {
    return false;
  }

  const relativeTarget = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distDir, relativeTarget);

  if (
    resolvedPath !== path.join(distDir, "index.html") &&
    !resolvedPath.startsWith(distDir + path.sep)
  ) {
    return false;
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return false;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const contentType = STATIC_MIME_TYPES[ext];
  if (!contentType) {
    return false;
  }

  const content = fs.readFileSync(resolvedPath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
  return true;
}

export function createColabApiServer(): Server {
  ensureBootstrapAdmin();

  return http.createServer(async (req, res) => {
    applySecurityHeaders(req, res);

    const method = req.method || "GET";
    if (!ALLOWED_METHODS.has(method)) {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!checkRateLimit(req)) {
      sendJson(res, 429, { error: "Too Many Requests. Please retry later." });
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = parsedUrl.pathname;

    try {
      // =====================================================================
      // 1. PUBLIC / SESSION BOOTSTRAP AUTHENTICATION ENDPOINTS
      // =====================================================================
      if (method === "GET" && pathname === "/api/auth/session") {
        ensureBootstrapAdmin();
        const actor = resolveAuthenticatedActor(req);
        if (actor) {
          sendJson(res, 200, {
            authenticated: true,
            user: actor.user,
            csrfToken: actor.csrfToken,
          });
          return;
        }
        const preAuthCsrf = issuePreAuthCsrfToken(res);
        sendJson(res, 200, {
          authenticated: false,
          user: null,
          csrfToken: preAuthCsrf,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/login") {
        if (!verifyPreAuthCsrfToken(req)) {
          sendJson(res, 403, { error: "Forbidden: Invalid or missing CSRF token." });
          return;
        }

        const body = await readJsonBody(req);
        const username = sanitizeStringInput(body.username, 64) || "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!checkLoginRateLimit(req, username)) {
          sendJson(res, 429, {
            error: "Too many failed login attempts. Please wait 60 seconds before retrying.",
          });
          return;
        }

        const cookies = parseCookies(req);
        const prevSession = cookies["__Host-hexa_session"] || cookies["hexa_session"];

        try {
          const { user, session } = authenticateUserSession(
            username,
            password,
            prevSession
          );
          clearLoginFailures(req, username);
          setSessionCookies(res, session.sessionId);
          sendJson(res, 200, {
            authenticated: true,
            user,
            csrfToken: session.csrfToken,
          });
        } catch (authErr) {
          recordLoginFailure(req, username);
          const msg =
            authErr instanceof Error ? authErr.message : "Invalid username or password.";
          sendJson(res, 401, { error: msg });
        }
        return;
      }

      // Serve static dashboard shell on GET non-API routes
      if (method === "GET" && !pathname.startsWith("/api/")) {
        if (tryServeDashboardStatic(pathname, res)) {
          return;
        }
      }

      // =====================================================================
      // 2. AUTHENTICATION GUARD FOR ALL PROTECTED /api/* ENDPOINTS
      // =====================================================================
      const actor = resolveAuthenticatedActor(req);
      if (!actor) {
        sendJson(res, 401, {
          error: "Unauthorized: Valid session or administrator credentials required.",
        });
        return;
      }

      if (method === "POST" && !verifyActorCsrf(req, actor)) {
        sendJson(res, 403, { error: "Forbidden: Invalid or missing CSRF token." });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/logout") {
        invalidateSession(actor.sessionId);
        clearSessionCookies(res);
        const nextPreCsrf = issuePreAuthCsrfToken(res);
        sendJson(res, 200, {
          authenticated: false,
          message: "Session terminated.",
          csrfToken: nextPreCsrf,
        });
        return;
      }

      // Protected dashboard overview endpoint (accessible to any authenticated active user)
      if (method === "GET" && pathname === "/api/dashboard/overview") {
        const creds = loadColabCredentials();
        const isAdmin = hasRequiredRole(actor, ["Admin"]);
        const infraSummary = isAdmin ? listInfrastructure().summary : null;
        sendJson(res, 200, {
          user: actor.user,
          colabMode: creds.activeMode,
          oauthEnabled: isOAuthEnabled(),
          gcpAppealStatus: creds.gcpAppealStatus,
          infrastructureSummary: infraSummary,
        });
        return;
      }

      // =====================================================================
      // 3. ADMIN-ONLY USER MANAGEMENT ENDPOINTS (/api/users/*)
      // =====================================================================
      if (pathname === "/api/users" || pathname.startsWith("/api/users/")) {
        if (!hasRequiredRole(actor, ["Admin"])) {
          sendJson(res, 403, {
            error: "Forbidden: Administrator role required for User Management.",
          });
          return;
        }

        if (method === "GET" && pathname === "/api/users") {
          sendJson(res, 200, { users: listUsers() });
          return;
        }

        if (method === "POST" && pathname === "/api/users/create") {
          const body = await readJsonBody(req);
          const created = createUser({
            username: sanitizeStringInput(body.username, 48) || "",
            displayName: sanitizeStringInput(body.displayName, 80) || "",
            role: (body.role as UserRole) || "Reviewer",
            password: typeof body.password === "string" ? body.password : "",
          });
          sendJson(res, 201, {
            message: `User '${created.username}' created.`,
            user: created,
          });
          return;
        }

        if (method === "POST" && pathname === "/api/users/update") {
          const body = await readJsonBody(req);
          const userId = sanitizeStringInput(body.id, 64);
          if (!userId) {
            sendJson(res, 400, { error: "User ID is required." });
            return;
          }
          const updated = updateUser(userId, {
            username:
              body.username !== undefined
                ? sanitizeStringInput(body.username, 48)
                : undefined,
            displayName:
              body.displayName !== undefined
                ? sanitizeStringInput(body.displayName, 80)
                : undefined,
            role: body.role !== undefined ? (body.role as UserRole) : undefined,
            active:
              typeof body.active === "boolean" ? body.active : undefined,
          });
          sendJson(res, 200, {
            message: `User '${updated.username}' updated.`,
            user: updated,
          });
          return;
        }

        if (method === "POST" && pathname === "/api/users/reset-password") {
          const body = await readJsonBody(req);
          const userId = sanitizeStringInput(body.id, 64);
          const newPassword =
            typeof body.newPassword === "string" ? body.newPassword : "";
          if (!userId) {
            sendJson(res, 400, { error: "User ID is required." });
            return;
          }
          const updated = resetUserPassword(userId, newPassword);
          sendJson(res, 200, {
            message: `Password reset for '${updated.username}'. Active sessions invalidated.`,
            user: updated,
          });
          return;
        }
      }

      // =====================================================================
      // 4. ADMIN-ONLY INFRASTRUCTURE MANAGEMENT ENDPOINTS (/api/infrastructure/*)
      // =====================================================================
      if (
        pathname === "/api/infrastructure" ||
        pathname.startsWith("/api/infrastructure/")
      ) {
        if (!hasRequiredRole(actor, ["Admin"])) {
          sendJson(res, 403, {
            error: "Forbidden: Administrator role required for Infrastructure Management.",
          });
          return;
        }

        if (method === "GET" && pathname === "/api/infrastructure") {
          sendJson(res, 200, listInfrastructure());
          return;
        }

        if (method === "POST" && pathname === "/api/infrastructure/create") {
          const body = await readJsonBody(req);
          const created = createInfrastructure(body);
          const current = listInfrastructure();
          sendJson(res, 201, {
            message: `Infrastructure '${created.name}' registered.`,
            item: created,
            summary: current.summary,
          });
          return;
        }

        if (method === "POST" && pathname === "/api/infrastructure/update") {
          const body = await readJsonBody(req);
          const id = sanitizeStringInput(body.id, 64);
          if (!id) {
            sendJson(res, 400, { error: "Infrastructure ID is required." });
            return;
          }
          const updated = updateInfrastructure(id, body);
          const current = listInfrastructure();
          sendJson(res, 200, {
            message: `Infrastructure '${updated.name}' updated.`,
            item: updated,
            summary: current.summary,
          });
          return;
        }
      }

      // =====================================================================
      // 5. GOOGLE COLAB INTEGRATION ENDPOINTS (/api/integrations/google/*)
      // =====================================================================
      if (pathname.startsWith("/api/integrations/google/")) {
        if (!hasRequiredRole(actor, ["Admin"])) {
          sendJson(res, 403, {
            error: "Forbidden: Administrator role required for Google Colab integration settings.",
          });
          return;
        }

        // GET /api/integrations/google/status
        if (method === "GET" && pathname === "/api/integrations/google/status") {
          const creds = loadColabCredentials();
          const hasClientId = Boolean(creds.clientId);
          const hasClientSecret = Boolean(creds.clientSecret);
          const hasRefreshToken = Boolean(creds.refreshToken);

          sendJson(res, 200, {
            activeMode: creds.activeMode,
            oauthEnabled: isOAuthEnabled(),
            gcpAppealStatus: creds.gcpAppealStatus,
            googleConnectionStatus:
              creds.activeMode === "MANUAL" ? "MANUAL_ACTIVE" : "OAUTH_DISABLED",
            oauthClientIdStatus: hasClientId ? "CONFIGURED" : "NOT_CONFIGURED",
            clientIdMasked: maskSecretValue(creds.clientId, 6),
            hasClientSecret,
            clientSecretMasked: hasClientSecret ? "************" : "Not Configured",
            refreshTokenStatus: hasRefreshToken ? "STORED_ENCRYPTED" : "NOT_CONFIGURED",
            colabApiConnectionStatus: creds.lastTested
              ? "VERIFIED_MOCKED"
              : "READY_FOR_TEST",
            subscriptionTier: creds.simulatedSubscriptionTier,
            runtimeEligibility: true,
            projectId: creds.projectId || null,
            scopes: creds.scopes,
            colabApiBaseUrl: creds.colabApiBaseUrl,
            colabApiVersion: creds.colabApiVersion,
            colabOperationsVersion: creds.colabOperationsVersion,
            manualNotebookUrl: creds.manualNotebookUrl || null,
            manualTunnelMasked: maskSecretValue(creds.manualTunnelEndpoint, 6),
            redirectUri: "http://127.0.0.1:3001/api/integrations/google/callback",
            lastUpdated: creds.lastUpdated,
            lastTested: creds.lastTested,
          });
          return;
        }

        // POST /api/integrations/google/config
        if (method === "POST" && pathname === "/api/integrations/google/config") {
          const body = await readJsonBody(req);
          const updates: Record<string, unknown> = {};

          const clientId = sanitizeStringInput(body.clientId, 200);
          if (clientId !== undefined) updates.clientId = clientId;

          const clientSecret = sanitizeStringInput(body.clientSecret, 200);
          if (clientSecret !== undefined) updates.clientSecret = clientSecret;

          const projectId = sanitizeStringInput(body.projectId, 128);
          if (projectId !== undefined) updates.projectId = projectId;

          const manualNotebookUrl = sanitizeStringInput(body.manualNotebookUrl, 512);
          if (manualNotebookUrl !== undefined)
            updates.manualNotebookUrl = manualNotebookUrl;

          const manualTunnelEndpoint = sanitizeStringInput(
            body.manualTunnelEndpoint,
            512
          );
          if (manualTunnelEndpoint !== undefined)
            updates.manualTunnelEndpoint = manualTunnelEndpoint;

          const datasetFolderId = sanitizeStringInput(body.datasetFolderId, 128);
          if (datasetFolderId !== undefined) updates.datasetFolderId = datasetFolderId;

          const checkpointFolderId = sanitizeStringInput(
            body.checkpointFolderId,
            128
          );
          if (checkpointFolderId !== undefined)
            updates.checkpointFolderId = checkpointFolderId;

          const modelFolderId = sanitizeStringInput(body.modelFolderId, 128);
          if (modelFolderId !== undefined) updates.modelFolderId = modelFolderId;

          const saved = saveColabCredentials(updates);

          sendJson(res, 200, {
            message: "Configuration saved and encrypted with AES-256-GCM.",
            activeMode: saved.activeMode,
            oauthEnabled: isOAuthEnabled(),
            clientIdMasked: maskSecretValue(saved.clientId, 6),
            hasClientSecret: Boolean(saved.clientSecret),
            hasRefreshToken: Boolean(saved.refreshToken),
            lastUpdated: saved.lastUpdated,
          });
          return;
        }

        // GET /api/integrations/google/auth-url
        if (method === "GET" && pathname === "/api/integrations/google/auth-url") {
          const state = generateOAuthCsrfState();
          const redirectUri = "http://127.0.0.1:3001/api/integrations/google/callback";
          try {
            const authUrl = buildGoogleOAuthUrl(redirectUri, state);
            res.setHeader(
              "Set-Cookie",
              `__Host-hexa_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/`
            );
            sendJson(res, 200, { authUrl });
          } catch (err) {
            if (err instanceof OAuthDisabledError) {
              sendJson(res, 403, {
                error: err.message,
                activeMode: "MANUAL",
                oauthEnabled: false,
              });
              return;
            }
            throw err;
          }
          return;
        }

        // POST /api/integrations/google/test-connection
        if (
          method === "POST" &&
          pathname === "/api/integrations/google/test-connection"
        ) {
          const result = await runNonDestructiveVerification();
          sendJson(res, 200, result);
          return;
        }

        // POST /api/integrations/google/disconnect
        if (method === "POST" && pathname === "/api/integrations/google/disconnect") {
          const updated = clearStoredTokens();
          sendJson(res, 200, {
            message: "Stored session tokens cleared.",
            activeMode: updated.activeMode,
            hasRefreshToken: false,
          });
          return;
        }
      }

      sendJson(res, 404, { error: "Endpoint not found" });
    } catch (err) {
      const safeMessage =
        err instanceof Error ? err.message : "Internal server error";
      sendJson(res, 400, { error: safeMessage });
    }
  });
}

// Start server strictly on 127.0.0.1 when invoked directly
if (require.main === module) {
  const apiPort = Number(process.env.PORT) || 3001;
  const dashboardPort = Number(process.env.DASHBOARD_PORT) || 4173;

  const apiServer = createColabApiServer();
  apiServer.listen(apiPort, "127.0.0.1", () => {
    console.log(
      `[HEXA AI Lab Backend] API listening strictly on http://127.0.0.1:${apiPort}`
    );
  });

  if (dashboardPort !== apiPort) {
    const dashboardServer = createColabApiServer();
    dashboardServer.listen(dashboardPort, "127.0.0.1", () => {
      console.log(
        `[HEXA AI Lab Gateway] Protected Dashboard & API listening strictly on http://127.0.0.1:${dashboardPort}`
      );
    });
  }
}
