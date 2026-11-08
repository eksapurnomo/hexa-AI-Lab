import crypto from "crypto";
import { loadColabCredentials, saveColabCredentials } from "./storage";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const COLAB_PRIMARY_SCOPE = "https://www.googleapis.com/auth/colaboratory";

const ALLOWED_REDIRECT_HOSTS = new Set(["localhost", "127.0.0.1"]);

export class OAuthDisabledError extends Error {
  constructor(
    message = "Google OAuth 2.0 is prepared but currently disabled while the Google Cloud appeal is pending. Manual Colab Mode is active."
  ) {
    super(message);
    this.name = "OAuthDisabledError";
  }
}

/**
 * Checks whether live Google OAuth is enabled.
 * Disabled by default while Google Cloud appeal is pending.
 */
export function isOAuthEnabled(): boolean {
  const creds = loadColabCredentials();
  return creds.oauthEnabled === true && process.env.GOOGLE_OAUTH_ENABLED === "true";
}

/**
 * Generates a 32-byte cryptographically random state string for CSRF mitigation.
 */
export function generateOAuthCsrfState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Constant-time validation of OAuth state parameter against stored cookie/session state.
 */
export function validateOAuthCsrfState(providedState: string, expectedState: string): boolean {
  if (!providedState || !expectedState) return false;
  const bufA = Buffer.from(providedState, "utf8");
  const bufB = Buffer.from(expectedState, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Strictly validates that the OAuth redirect URI belongs to an allowed local/configured host.
 */
export function validateRedirectUri(redirectUri: string): boolean {
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!ALLOWED_REDIRECT_HOSTS.has(parsed.hostname)) {
      return false;
    }
    return parsed.pathname === "/api/integrations/google/callback";
  } catch {
    return false;
  }
}

/**
 * Builds the Google OAuth 2.0 Authorization URL.
 * Note: Google Drive permissions are NOT assumed or bundled with the Colab scope.
 */
export function buildGoogleOAuthUrl(redirectUri: string, state: string): string {
  if (!isOAuthEnabled()) {
    throw new OAuthDisabledError();
  }
  if (!validateRedirectUri(redirectUri)) {
    throw new Error("Invalid or untrusted OAuth redirect URI.");
  }

  const creds = loadColabCredentials();
  if (!creds.clientId) {
    throw new Error("Google OAuth Client ID is not configured.");
  }

  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: creds.scopes || COLAB_PRIMARY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Prepared server-side authorization code exchange.
 * Guarded while OAuth is disabled.
 */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<{ expiresIn: number; hasRefreshToken: boolean }> {
  if (!isOAuthEnabled()) {
    throw new OAuthDisabledError();
  }
  if (!validateRedirectUri(redirectUri)) {
    throw new Error("Invalid OAuth redirect URI.");
  }

  const creds = loadColabCredentials();
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error("OAuth Client ID and Client Secret are required.");
  }

  const body = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed with status ${response.status}`);
  }

  const tokenData = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (tokenData.refresh_token) {
    saveColabCredentials({ refreshToken: tokenData.refresh_token });
  }

  return {
    expiresIn: tokenData.expires_in || 3600,
    hasRefreshToken: Boolean(tokenData.refresh_token || creds.refreshToken),
  };
}

/**
 * Prepared token refresh helper.
 * Guarded while OAuth is disabled.
 */
export async function refreshGoogleAccessToken(): Promise<string> {
  if (!isOAuthEnabled()) {
    throw new OAuthDisabledError();
  }

  const creds = loadColabCredentials();
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    throw new Error("Missing OAuth credentials or refresh token.");
  }

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("No access token returned by Google OAuth endpoint.");
  }

  return data.access_token;
}

