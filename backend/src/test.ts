import assert from "assert";
import fs from "fs";
import path from "path";
import { encryptSecret, decryptSecret, maskSecretValue } from "./colab/crypto";
import {
  loadColabCredentials,
  saveColabCredentials,
  clearStoredTokens,
} from "./colab/storage";
import {
  isOAuthEnabled,
  generateOAuthCsrfState,
  validateOAuthCsrfState,
  validateRedirectUri,
  buildGoogleOAuthUrl,
  OAuthDisabledError,
} from "./colab/oauth";
import { ColabRestApiClient, runNonDestructiveVerification } from "./colab/client";
import { getAdminApiToken, getActiveCsrfToken } from "./middleware/security";
import { createColabApiServer } from "./server";

async function runTests(): Promise<void> {
  console.log("=== HEXA AI Lab — Google Colab Integration Test Suite ===");

  // 1. Test AES-256-GCM encryption & masking
  const sampleSecret = "sample-test-placeholder-value-9876";
  const cipher = encryptSecret(sampleSecret);
  assert.notStrictEqual(cipher, sampleSecret, "Ciphertext must not match plaintext");
  assert.strictEqual(cipher.split(":").length, 4, "Ciphertext must have 4 components (salt:iv:tag:data)");
  const decrypted = decryptSecret(cipher);
  assert.strictEqual(decrypted, sampleSecret, "Decrypted value must match original plaintext");
  const masked = maskSecretValue(sampleSecret, 4);
  assert.strictEqual(masked, "************9876", "Masked output must hide prefix and keep last 4 chars");
  console.log("[PASS] 1. AES-256-GCM Encryption & Secret Masking");

  // 2. Test Encrypted Credential Storage & Manual Mode Default
  const initial = loadColabCredentials();
  assert.strictEqual(initial.activeMode, "MANUAL", "Default active mode must be MANUAL");
  assert.strictEqual(initial.oauthEnabled, false, "OAuth must be disabled by default");

  saveColabCredentials({
    clientId: "1234567890-placeholder.apps.googleusercontent.com",
    clientSecret: "placeholder-secret-value-not-real",
    projectId: "hexa-ai-lab-placeholder",
  });

  const storeFile = path.resolve(process.cwd(), ".colab-credentials.enc");
  assert.ok(fs.existsSync(storeFile), "Encrypted store file must be created");
  const rawOnDisk = fs.readFileSync(storeFile, "utf8");
  assert.ok(!rawOnDisk.includes("placeholder-secret-value-not-real"), "Plaintext secret must never appear on disk");

  const reloaded = loadColabCredentials();
  assert.strictEqual(reloaded.projectId, "hexa-ai-lab-placeholder");
  assert.strictEqual(reloaded.activeMode, "MANUAL");
  console.log("[PASS] 2. Encrypted Storage & Manual Colab Mode Persistence");

  // 3. Test OAuth 2.0 CSRF State, Redirect URI Validation, and Disabled Guard
  assert.strictEqual(isOAuthEnabled(), false, "Live OAuth must remain disabled pending GCP appeal");
  const state = generateOAuthCsrfState();
  assert.strictEqual(state.length, 64, "CSRF state must be 64 hex chars (32 bytes)");
  assert.strictEqual(validateOAuthCsrfState(state, state), true, "Valid state must pass");
  assert.strictEqual(validateOAuthCsrfState(state, "tampered-state"), false, "Tampered state must fail");
  assert.strictEqual(
    validateRedirectUri("http://127.0.0.1:3001/api/integrations/google/callback"),
    true,
    "Localhost callback URI must be valid"
  );
  assert.strictEqual(
    validateRedirectUri("https://evil.example.com/api/integrations/google/callback"),
    false,
    "External untrusted redirect URI must be rejected"
  );

  assert.throws(
    () => buildGoogleOAuthUrl("http://127.0.0.1:3001/api/integrations/google/callback", state),
    OAuthDisabledError,
    "buildGoogleOAuthUrl must throw OAuthDisabledError while disabled"
  );
  console.log("[PASS] 3. OAuth 2.0 Prepared & Disabled Guard + CSRF/Redirect Validation");

  // 4. Test Official Colab REST API Client Surface & Guard
  const requiredMethods = [
    "getSubscription",
    "listRuntimeSpecs",
    "createRuntime",
    "listRuntimes",
    "getRuntime",
    "deleteRuntime",
    "getOperation",
    "listOperations",
    "waitOperation",
  ] as const;

  for (const methodName of requiredMethods) {
    assert.strictEqual(
      typeof ColabRestApiClient[methodName],
      "function",
      `ColabRestApiClient.${methodName} must be implemented`
    );
  }

  await assert.rejects(
    async () => ColabRestApiClient.getSubscription(),
    OAuthDisabledError,
    "Live getSubscription must be blocked while OAuth is disabled"
  );
  console.log("[PASS] 4. Official Colab REST API Client (v1beta & v1) Surface & Guard");

  // 5. Test Non-Destructive Mocked Connection Verification
  const verification = await runNonDestructiveVerification();
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.mode, "MANUAL_MOCKED");
  assert.strictEqual(verification.oauthStatus, "DISABLED_PENDING_GCP_APPEAL");
  assert.strictEqual(verification.subscription.tier, "TIER_PRO");
  assert.strictEqual(verification.runtimeEligibility, true);
  assert.ok(verification.runtimeSpecs.length >= 4, "Must return runtime specifications");
  console.log("[PASS] 5. Non-Destructive Mocked Connection Verification");

  // 6. Test HTTP Server Security, RBAC, CSRF, and Endpoints on 127.0.0.1
  const server = createColabApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = getAdminApiToken();
  const csrfToken = getActiveCsrfToken();

  try {
    // 6a. Unauthorized request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/integrations/google/status`);
    assert.strictEqual(unauthRes.status, 401, "Unauthenticated request must return 401");
    assert.strictEqual(unauthRes.headers.get("x-frame-options"), "DENY");
    assert.strictEqual(unauthRes.headers.get("x-content-type-options"), "nosniff");

    // 6b. Authorized GET /status -> 200
    const statusRes = await fetch(`${baseUrl}/api/integrations/google/status`, {
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as Record<string, unknown>;
    assert.strictEqual(statusJson.activeMode, "MANUAL");
    assert.strictEqual(statusJson.oauthEnabled, false);
    assert.strictEqual(statusJson.clientIdMasked, "************nt.com");

    // 6c. POST without CSRF token -> 403
    const noCsrfRes = await fetch(`${baseUrl}/api/integrations/google/test-connection`, {
      method: "POST",
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(noCsrfRes.status, 403, "POST without CSRF token must return 403");

    // 6d. Authorized POST /test-connection with CSRF -> 200
    const testConnRes = await fetch(`${baseUrl}/api/integrations/google/test-connection`, {
      method: "POST",
      headers: {
        "X-Hexa-Admin-Token": adminToken,
        "X-CSRF-Token": csrfToken,
      },
    });
    assert.strictEqual(testConnRes.status, 200);
    const testConnJson = (await testConnRes.json()) as { success: boolean; subscription: { tier: string } };
    assert.strictEqual(testConnJson.success, true);
    assert.strictEqual(testConnJson.subscription.tier, "TIER_PRO");

    // 6e. GET /auth-url -> 403 while OAuth is disabled
    const authUrlRes = await fetch(`${baseUrl}/api/integrations/google/auth-url`, {
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(authUrlRes.status, 403);

    // 6f. Disallowed method -> 405
    const deleteRes = await fetch(`${baseUrl}/api/integrations/google/status`, {
      method: "DELETE",
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(deleteRes.status, 405);

    console.log("[PASS] 6. HTTP Server RBAC, CSRF, Security Headers & Endpoints (127.0.0.1)");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    clearStoredTokens();
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile);
    }
  }

  console.log("=== ALL TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});

