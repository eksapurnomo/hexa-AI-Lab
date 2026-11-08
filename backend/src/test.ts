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
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "./auth/password";
import {
  ensureBootstrapAdmin,
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  authenticateUserSession,
  validateSessionToken,
} from "./auth/users";
import {
  listInfrastructure,
  createInfrastructure,
  updateInfrastructure,
} from "./infra/storage";
import {
  getAdminApiToken,
  getActiveCsrfToken,
  resetRateLimitsForTest,
} from "./middleware/security";
import { createColabApiServer } from "./server";

function extractCookieHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((raw) => raw.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function runTests(): Promise<void> {
  console.log("=== HEXA AI Lab — Backend, Auth, RBAC & Infrastructure Test Suite ===");

  const storeFile = path.resolve(process.cwd(), ".colab-credentials.enc");
  const usersFile = path.resolve(process.cwd(), ".hexa-users.enc");
  const sessionsFile = path.resolve(process.cwd(), ".hexa-sessions.enc");
  const infraFile = path.resolve(process.cwd(), ".hexa-infrastructure.enc");
  const bootstrapSecretFile = path.resolve(process.cwd(), ".bootstrap_admin.secret");
  const masterKeyFile = path.resolve(process.cwd(), ".master_key.secret");

  // Clean test state before starting
  for (const f of [storeFile, usersFile, sessionsFile, infraFile, bootstrapSecretFile, masterKeyFile]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // 1. Test AES-256-GCM encryption & masking
  const sampleSecret = "sample-test-placeholder-value-9876";
  const cipher = encryptSecret(sampleSecret);
  assert.notStrictEqual(cipher, sampleSecret, "Ciphertext must not match plaintext");
  assert.strictEqual(
    cipher.split(":").length,
    4,
    "Ciphertext must have 4 components (salt:iv:tag:data)"
  );
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

  assert.ok(fs.existsSync(storeFile), "Encrypted store file must be created");
  const rawOnDisk = fs.readFileSync(storeFile, "utf8");
  assert.ok(
    !rawOnDisk.includes("placeholder-secret-value-not-real"),
    "Plaintext secret must never appear on disk"
  );

  const reloaded = loadColabCredentials();
  assert.strictEqual(reloaded.projectId, "hexa-ai-lab-placeholder");
  assert.strictEqual(reloaded.activeMode, "MANUAL");
  console.log("[PASS] 2. Encrypted Storage & Manual Colab Mode Persistence");

  // 3. Test OAuth 2.0 CSRF State, Redirect URI Validation, and Disabled Guard
  assert.strictEqual(isOAuthEnabled(), false, "Live OAuth must remain disabled pending GCP appeal");
  const state = generateOAuthCsrfState();
  assert.strictEqual(state.length, 64, "CSRF state must be 64 hex chars (32 bytes)");
  assert.strictEqual(validateOAuthCsrfState(state, state), true, "Valid state must pass");
  assert.strictEqual(
    validateOAuthCsrfState(state, "tampered-state"),
    false,
    "Tampered state must fail"
  );
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
    () =>
      buildGoogleOAuthUrl("http://127.0.0.1:3001/api/integrations/google/callback", state),
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

  // 6. Test Salted Password Hashing & Strength Policy
  assert.strictEqual(validatePasswordStrength("short").valid, false);
  assert.strictEqual(validatePasswordStrength("StrongPass!2026").valid, true);
  const pwHash1 = hashPassword("StrongPass!2026");
  const pwHash2 = hashPassword("StrongPass!2026");
  assert.ok(pwHash1.startsWith("$2b$12$"), "Hash must use salted $2b$12$ format");
  assert.notStrictEqual(pwHash1, pwHash2, "Unique salts must produce distinct hashes");
  assert.strictEqual(verifyPassword("StrongPass!2026", pwHash1), true);
  assert.strictEqual(verifyPassword("WrongPassword!2026", pwHash1), false);
  console.log("[PASS] 6. Salted Password Hashing ($2b$12$) & Strength Validation");

  // 7. Test Admin Bootstrap, User Management, Session Rotation & Deactivation Guard
  ensureBootstrapAdmin();
  const initialUsers = listUsers();
  assert.strictEqual(initialUsers.length, 1, "Bootstrap must create exactly 1 initial Admin");
  assert.strictEqual(initialUsers[0].role, "Admin");

  // Calling ensureBootstrapAdmin again must NOT overwrite or duplicate admin
  ensureBootstrapAdmin();
  assert.strictEqual(listUsers().length, 1, "Bootstrap must not duplicate existing Admin");

  const mlUser = createUser({
    username: "ml_engineer_1",
    displayName: "Raka (ML Engineer)",
    role: "ML Engineer",
    password: "EngineerPassword#2026",
  });
  assert.strictEqual(mlUser.role, "ML Engineer");
  assert.strictEqual(mlUser.active, true);

  const auth1 = authenticateUserSession("ml_engineer_1", "EngineerPassword#2026");
  assert.ok(auth1.session.sessionId.length === 64);
  assert.ok(validateSessionToken(auth1.session.sessionId) !== null);

  // Session rotation on re-login must invalidate previous session ID
  const auth2 = authenticateUserSession(
    "ml_engineer_1",
    "EngineerPassword#2026",
    auth1.session.sessionId
  );
  assert.notStrictEqual(auth1.session.sessionId, auth2.session.sessionId);
  assert.strictEqual(validateSessionToken(auth1.session.sessionId), null);
  assert.ok(validateSessionToken(auth2.session.sessionId) !== null);

  // Deactivating user must immediately invalidate active sessions and block login
  updateUser(mlUser.id, { active: false });
  assert.strictEqual(
    validateSessionToken(auth2.session.sessionId),
    null,
    "Deactivated user session must be invalidated immediately"
  );
  assert.throws(
    () => authenticateUserSession("ml_engineer_1", "EngineerPassword#2026"),
    /deactivated/i,
    "Deactivated user must not be able to log in"
  );

  // Re-activate and test password reset
  updateUser(mlUser.id, { active: true });
  resetUserPassword(mlUser.id, "NewEngineerPass$99");
  assert.throws(() =>
    authenticateUserSession("ml_engineer_1", "EngineerPassword#2026")
  );
  const authAfterReset = authenticateUserSession("ml_engineer_1", "NewEngineerPass$99");
  assert.strictEqual(authAfterReset.user.username, "ml_engineer_1");
  console.log("[PASS] 7. Bootstrap Admin, User Management, Session Rotation & Deactivation");

  // 8. Test Infrastructure Inventory Persistence, Manual Status & Secret Rejection
  const gpuNode = createInfrastructure({
    name: "hexa-gpu-node-01",
    type: "GPU Server",
    provider: "Local WSL / Dedicated GPU",
    environment: "Development",
    hostnameOrIp: "192.168.10.50",
    operatingSystem: "Ubuntu 24.04 LTS",
    cpuSpecs: "16 vCPU AMD EPYC",
    ramCapacity: "64 GB DDR5",
    gpuModel: "NVIDIA RTX 4090",
    gpuVram: "24 GB",
    storageCapacity: "2 TB NVMe",
    region: "Jakarta Lab",
    purpose: "QLoRA Fine-Tuning & Evaluation",
     notes: "Registered for manual benchmark runs.",
  });
  assert.strictEqual(
    gpuNode.status,
    "Registered",
    "Default status must be Registered (never assumed Online)"
  );

  updateInfrastructure(gpuNode.id, { status: "Online" });
  const infraState = listInfrastructure();
  assert.strictEqual(infraState.summary.totalRegistered, 1);
  assert.strictEqual(infraState.summary.onlineCount, 1);
  assert.strictEqual(infraState.summary.gpuEnabledCount, 1);

  assert.throws(
    () =>
      createInfrastructure({
        name: "bad-node",
        type: "VPS",
        provider: "Hostinger VPS",
        hostnameOrIp: "10.0.0.2",
        notes: "-----BEGIN OPENSSH PRIVATE KEY-----",
      }),
    /Security policy violation/i,
    "SSH private keys must be rejected by infrastructure storage"
  );
  console.log("[PASS] 8. Infrastructure Inventory Persistence, Manual Status & Secret Guard");

  // 9. Test HTTP Server Security, Session Login/Logout, Server-Side RBAC & Endpoints on 127.0.0.1
  resetRateLimitsForTest();
  const server = createColabApiServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 3001;
  const baseUrl = `http://127.0.0.1:${port}`;
  const adminToken = getAdminApiToken();
  const csrfToken = getActiveCsrfToken();

  try {
    // 9a. Unauthenticated request to protected endpoints -> 401
    const unauthColab = await fetch(`${baseUrl}/api/integrations/google/status`);
    assert.strictEqual(unauthColab.status, 401);
    assert.strictEqual(unauthColab.headers.get("x-frame-options"), "DENY");
    assert.strictEqual(unauthColab.headers.get("x-content-type-options"), "nosniff");

    const unauthUsers = await fetch(`${baseUrl}/api/users`);
    assert.strictEqual(unauthUsers.status, 401);

    const unauthInfra = await fetch(`${baseUrl}/api/infrastructure`);
    assert.strictEqual(unauthInfra.status, 401);

    // 9b. Pre-auth session check returns authenticated: false + pre-auth CSRF token
    const sessionInitRes = await fetch(`${baseUrl}/api/auth/session`);
    assert.strictEqual(sessionInitRes.status, 200);
    const sessionInitCookies = extractCookieHeader(
      sessionInitRes.headers.getSetCookie ? sessionInitRes.headers.getSetCookie() : []
    );
    const sessionInitJson = (await sessionInitRes.json()) as {
      authenticated: boolean;
      csrfToken: string;
    };
    assert.strictEqual(sessionInitJson.authenticated, false);
    assert.ok(sessionInitJson.csrfToken.length >= 32);

    // 9c. Invalid password login -> 401
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": sessionInitJson.csrfToken,
        Cookie: sessionInitCookies,
      },
      body: JSON.stringify({ username: "ml_engineer_1", password: "WrongPassword" }),
    });
    assert.strictEqual(badLoginRes.status, 401);

    // 9d. Valid login as non-admin ("ML Engineer") -> 200 + HttpOnly session cookie
    const engLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": sessionInitJson.csrfToken,
        Cookie: sessionInitCookies,
      },
      body: JSON.stringify({ username: "ml_engineer_1", password: "NewEngineerPass$99" }),
    });
    assert.strictEqual(engLoginRes.status, 200);
    const engCookies = extractCookieHeader(
      engLoginRes.headers.getSetCookie ? engLoginRes.headers.getSetCookie() : []
    );
    const engLoginJson = (await engLoginRes.json()) as {
      authenticated: boolean;
      csrfToken: string;
      user: { role: string };
    };
    assert.strictEqual(engLoginJson.authenticated, true);
    assert.strictEqual(engLoginJson.user.role, "ML Engineer");

    // 9e. Non-admin ("ML Engineer") can access /api/dashboard/overview (200)
    //     but MUST be blocked (403 Forbidden) from /api/users and /api/infrastructure!
    const engOverviewRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Cookie: engCookies },
    });
    assert.strictEqual(engOverviewRes.status, 200);

    const engUsersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Cookie: engCookies },
    });
    assert.strictEqual(
      engUsersRes.status,
      403,
      "Non-admin must be blocked from User Management APIs"
    );

    const engInfraRes = await fetch(`${baseUrl}/api/infrastructure`, {
      headers: { Cookie: engCookies },
    });
    assert.strictEqual(
      engInfraRes.status,
      403,
      "Non-admin must be blocked from Infrastructure APIs"
    );

    // 9f. Logout invalidates session
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: engCookies,
        "X-CSRF-Token": engLoginJson.csrfToken,
      },
    });
    assert.strictEqual(logoutRes.status, 200);

    const afterLogoutRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Cookie: engCookies },
    });
    assert.strictEqual(
      afterLogoutRes.status,
      401,
      "Logged-out session cookie must be rejected"
    );

    // 9g. Admin API access & Colab endpoints verification
    const statusRes = await fetch(`${baseUrl}/api/integrations/google/status`, {
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as Record<string, unknown>;
    assert.strictEqual(statusJson.activeMode, "MANUAL");
    assert.strictEqual(statusJson.oauthEnabled, false);

    const adminUsersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(adminUsersRes.status, 200);

    const adminInfraRes = await fetch(`${baseUrl}/api/infrastructure`, {
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(adminInfraRes.status, 200);

    const noCsrfRes = await fetch(`${baseUrl}/api/integrations/google/test-connection`, {
      method: "POST",
      headers: { "X-Hexa-Admin-Token": adminToken },
    });
    assert.strictEqual(noCsrfRes.status, 403, "POST without CSRF token must return 403");

    const testConnRes = await fetch(`${baseUrl}/api/integrations/google/test-connection`, {
      method: "POST",
      headers: {
        "X-Hexa-Admin-Token": adminToken,
        "X-CSRF-Token": csrfToken,
      },
    });
    assert.strictEqual(testConnRes.status, 200);

    console.log(
      "[PASS] 9. HTTP Server Session Auth, Logout, RBAC Enforcement, CSRF & Colab Endpoints"
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    clearStoredTokens();
    for (const f of [storeFile, usersFile, sessionsFile, infraFile, bootstrapSecretFile, masterKeyFile]) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
  }

  console.log("=== ALL 9 TEST SUITES PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
