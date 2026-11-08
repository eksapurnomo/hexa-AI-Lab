import http, { IncomingMessage, ServerResponse, Server } from "http";
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
  applySecurityHeaders,
  checkRateLimit,
  verifyAdminRequest,
  verifyCsrfRequest,
} from "./middleware/security";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);
const MAX_BODY_BYTES = 16 * 1024; // 16 KB limit

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

export function createColabApiServer(): Server {
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

    if (!verifyAdminRequest(req)) {
      sendJson(res, 401, { error: "Unauthorized: Administrator credentials required." });
      return;
    }

    if (method === "POST" && !verifyCsrfRequest(req)) {
      sendJson(res, 403, { error: "Forbidden: Invalid or missing CSRF token." });
      return;
    }

    const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = parsedUrl.pathname;

    try {
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
          googleConnectionStatus: creds.activeMode === "MANUAL" ? "MANUAL_ACTIVE" : "OAUTH_DISABLED",
          oauthClientIdStatus: hasClientId ? "CONFIGURED" : "NOT_CONFIGURED",
          clientIdMasked: maskSecretValue(creds.clientId, 6),
          hasClientSecret,
          clientSecretMasked: hasClientSecret ? "************" : "Not Configured",
          refreshTokenStatus: hasRefreshToken ? "STORED_ENCRYPTED" : "NOT_CONFIGURED",
          colabApiConnectionStatus: creds.lastTested ? "VERIFIED_MOCKED" : "READY_FOR_TEST",
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
        if (manualNotebookUrl !== undefined) updates.manualNotebookUrl = manualNotebookUrl;

        const manualTunnelEndpoint = sanitizeStringInput(body.manualTunnelEndpoint, 512);
        if (manualTunnelEndpoint !== undefined) updates.manualTunnelEndpoint = manualTunnelEndpoint;

        const datasetFolderId = sanitizeStringInput(body.datasetFolderId, 128);
        if (datasetFolderId !== undefined) updates.datasetFolderId = datasetFolderId;

        const checkpointFolderId = sanitizeStringInput(body.checkpointFolderId, 128);
        if (checkpointFolderId !== undefined) updates.checkpointFolderId = checkpointFolderId;

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
      if (method === "POST" && pathname === "/api/integrations/google/test-connection") {
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

      sendJson(res, 404, { error: "Endpoint not found" });
    } catch (err) {
      const safeMessage = err instanceof Error ? err.message : "Internal server error";
      sendJson(res, 400, { error: safeMessage });
    }
  });
}

// Start server strictly on 127.0.0.1 when invoked directly
if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  const server = createColabApiServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`[HEXA AI Lab Backend] Listening strictly on http://127.0.0.1:${port}`);
  });
}
