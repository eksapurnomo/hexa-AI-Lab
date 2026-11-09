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
  SCRYPT_PARAMS,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  needsPasswordRehash,
  createLegacyPrefixedHashForTest,
} from "./auth/password";
import {
  DEFAULT_DEV_ADMIN_PASSWORD,
  ensureBootstrapAdmin,
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  authenticateUserSession,
  validateSessionToken,
  setLegacyHashForUserTest,
  userHasCanonicalScryptHash,
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
  const masterKeyFile = path.resolve(process.cwd(), ".master_key.secret");
  const obsoleteBootstrapSecret = path.resolve(process.cwd(), ".bootstrap_admin.secret");

  const stateFiles = [
    storeFile,
    usersFile,
    sessionsFile,
    infraFile,
    masterKeyFile,
  ];
  const backups = new Map<string, { data: Buffer; mode: number }>();

  // Ensure obsolete plaintext bootstrap secret file is removed
  if (fs.existsSync(obsoleteBootstrapSecret)) {
    fs.unlinkSync(obsoleteBootstrapSecret);
  }

  // Preserve any existing runtime state before running isolated test suite
  for (const f of stateFiles) {
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f);
      backups.set(f, {
        data: fs.readFileSync(f),
        mode: stat.mode & 0o777,
      });
      fs.unlinkSync(f);
    }
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

  // 6. Test Salted Password Hashing ($scrypt$ln=14,r=8,p=1$), Malformed Rejection & Legacy Compatibility
  assert.strictEqual(SCRYPT_PARAMS.algorithm, "scrypt");
  assert.strictEqual(SCRYPT_PARAMS.N, 16384);
  assert.strictEqual(SCRYPT_PARAMS.r, 8);
  assert.strictEqual(SCRYPT_PARAMS.p, 1);
  assert.strictEqual(SCRYPT_PARAMS.saltBytes, 16);
  assert.strictEqual(SCRYPT_PARAMS.keyLen, 64);

  assert.strictEqual(validatePasswordStrength("short").valid, false);
  assert.strictEqual(validatePasswordStrength("StrongPass!2026").valid, true);

  const pwHash1 = hashPassword("StrongPass!2026");
  const pwHash2 = hashPassword("StrongPass!2026");
  assert.ok(
    pwHash1.startsWith("$scrypt$ln=14,r=8,p=1$"),
    "Hash must use genuine PHC $scrypt$ln=14,r=8,p=1$ format"
  );
  assert.ok(
    !pwHash1.startsWith("$2b$"),
    "scrypt output must never be labeled as bcrypt ($2b$)"
  );
  assert.notStrictEqual(pwHash1, pwHash2, "Unique CSPRNG salts must produce distinct hashes");
  assert.strictEqual(verifyPassword("StrongPass!2026", pwHash1), true);
  assert.strictEqual(verifyPassword("WrongPassword!2026", pwHash1), false);
  assert.strictEqual(needsPasswordRehash(pwHash1), false);

  // Malformed or unsupported hash formats must be safely rejected
  const malformedHashes = [
    "",
    "plaintext",
    "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2g",
    "$scrypt$ln=99,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "$scrypt$ln=14,r=8,p=1$not_valid_base64!$not_valid_base64!",
    "$scrypt$ln=14,r=8,p=1$c2hvcnQ$c2hvcnQ",
    "$2b$12$malformed_short",
  ];
  for (const badHash of malformedHashes) {
    assert.strictEqual(
      verifyPassword("StrongPass!2026", badHash),
      false,
      "Malformed hash format must be rejected safely"
    );
  }

  // Backward compatibility with legacy pre-migration records
  const legacyHash = createLegacyPrefixedHashForTest("LegacyPass#2026", 12);
  assert.strictEqual(
    verifyPassword("LegacyPass#2026", legacyHash),
    true,
    "Existing pre-migration account hash must remain verifiable"
  );
  assert.strictEqual(
    verifyPassword("WrongLegacyPass#2026", legacyHash),
    false,
    "Incorrect password against legacy hash must be rejected"
  );
  assert.strictEqual(
    needsPasswordRehash(legacyHash),
    true,
    "Legacy hash must be flagged for transparent rehash upgrade"
  );
  console.log(
    "[PASS] 6. Salted scrypt Password Hashing ($scrypt$ln=14,r=8,p=1$), Malformed Rejection & Legacy Compatibility"
  );

  // 7. Test Admin Provisioning, User Management, Legacy Migration, Session Rotation & Deactivation Guard
  // 7a. Fresh development bootstrap without environment variable
  assert.strictEqual(
    fs.existsSync(obsoleteBootstrapSecret),
    false,
    "No obsolete .bootstrap_admin.secret file should exist prior to bootstrap"
  );
  ensureBootstrapAdmin();
  const devInitialUsers = listUsers();
  assert.strictEqual(devInitialUsers.length, 1, "Dev bootstrap must create exactly 1 initial Admin");
  assert.strictEqual(devInitialUsers[0].role, "Admin");
  assert.strictEqual(
    userHasCanonicalScryptHash(devInitialUsers[0].id),
    true,
    "Bootstrap Admin must use canonical $scrypt$ln=14,r=8,p=1$ hash"
  );
  assert.strictEqual(
    fs.existsSync(obsoleteBootstrapSecret),
    false,
    "No plaintext bootstrap secret file must be written to disk in dev bootstrap"
  );
  const devAdminAuth = authenticateUserSession(devInitialUsers[0].username, DEFAULT_DEV_ADMIN_PASSWORD);
  assert.ok(devAdminAuth.session.sessionId.length === 64);
  assert.throws(
    () => authenticateUserSession(devInitialUsers[0].username, "WrongPassword#9999"),
    /Invalid username or password/
  );

  // 7b. Production bootstrap without environment variable fails safely and clearly
  if (fs.existsSync(usersFile)) fs.unlinkSync(usersFile);
  if (fs.existsSync(sessionsFile)) fs.unlinkSync(sessionsFile);
  const origNodeEnv = process.env.NODE_ENV;
  const origAdminPw = process.env.HEXA_ADMIN_INITIAL_PASSWORD;
  const origLegacyPw = process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD;

  process.env.NODE_ENV = "production";
  delete process.env.HEXA_ADMIN_INITIAL_PASSWORD;
  delete process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD;

  assert.throws(
    () => ensureBootstrapAdmin(),
    /requires HEXA_ADMIN_INITIAL_PASSWORD in production environment/i,
    "Production bootstrap without HEXA_ADMIN_INITIAL_PASSWORD must fail safely and clearly"
  );
  assert.strictEqual(
    fs.existsSync(usersFile),
    false,
    "No user file must be created when production provisioning fails"
  );
  assert.strictEqual(
    fs.existsSync(obsoleteBootstrapSecret),
    false,
    "No plaintext secret must be created on failed production provisioning"
  );

  // 7c. Production bootstrap with environment variable provisions Admin with canonical scrypt
  process.env.HEXA_ADMIN_INITIAL_PASSWORD = "StrongProdAdmin#2026";
  ensureBootstrapAdmin();
  const prodInitialUsers = listUsers();
  assert.strictEqual(prodInitialUsers.length, 1, "Production bootstrap must create exactly 1 Admin");
  assert.strictEqual(
    userHasCanonicalScryptHash(prodInitialUsers[0].id),
    true,
    "Production Admin must use canonical scrypt hash format"
  );
  assert.strictEqual(
    fs.existsSync(obsoleteBootstrapSecret),
    false,
    "No plaintext bootstrap secret file must be written to disk in production"
  );
  const prodAuth = authenticateUserSession(prodInitialUsers[0].username, "StrongProdAdmin#2026");
  assert.strictEqual(prodAuth.user.role, "Admin");
  assert.throws(
    () => authenticateUserSession(prodInitialUsers[0].username, "WrongProdPassword#99"),
    /Invalid username or password/
  );

  // 7d. Existing Admin account is preserved on subsequent restarts (never overwritten)
  const originalAdminId = prodInitialUsers[0].id;
  process.env.HEXA_ADMIN_INITIAL_PASSWORD = "CompletelyDifferentPassword#999";
  ensureBootstrapAdmin();
  const recheckedUsers = listUsers();
  assert.strictEqual(recheckedUsers.length, 1, "Restart must not create duplicate Admin");
  assert.strictEqual(recheckedUsers[0].id, originalAdminId, "Existing Admin ID must be preserved");
  const stillValidLogin = authenticateUserSession(recheckedUsers[0].username, "StrongProdAdmin#2026");
  assert.strictEqual(stillValidLogin.user.id, originalAdminId);
  assert.throws(
    () => authenticateUserSession(recheckedUsers[0].username, "CompletelyDifferentPassword#999"),
    /Invalid username or password/,
    "Existing Admin password must not be overwritten by subsequent environment changes"
  );

  // Restore environment variables
  if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
  else delete process.env.NODE_ENV;
  if (origAdminPw !== undefined) process.env.HEXA_ADMIN_INITIAL_PASSWORD = origAdminPw;
  else delete process.env.HEXA_ADMIN_INITIAL_PASSWORD;
  if (origLegacyPw !== undefined) process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD = origLegacyPw;
  else delete process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD;

  // 7e. Create ML Engineer, session rotation, deactivation, and password reset
  const mlUser = createUser({
    username: "ml_engineer_1",
    displayName: "Raka (ML Engineer)",
    role: "ML Engineer",
    password: "EngineerPassword#2026",
  });
  assert.strictEqual(mlUser.role, "ML Engineer");
  assert.strictEqual(mlUser.active, true);
  assert.strictEqual(userHasCanonicalScryptHash(mlUser.id), true);

  // Simulate an existing pre-migration user account and verify transparent upgrade on login
  const legacyUserHash = createLegacyPrefixedHashForTest("EngineerPassword#2026", 12);
  setLegacyHashForUserTest(mlUser.id, legacyUserHash);
  assert.strictEqual(
    userHasCanonicalScryptHash(mlUser.id),
    false,
    "Pre-migration user hash must initially be detected as legacy"
  );

  const auth1 = authenticateUserSession("ml_engineer_1", "EngineerPassword#2026");
  assert.ok(auth1.session.sessionId.length === 64);
  assert.ok(validateSessionToken(auth1.session.sessionId) !== null);
  assert.strictEqual(
    userHasCanonicalScryptHash(mlUser.id),
    true,
    "Login must transparently migrate legacy account hash to canonical $scrypt$ln=14,r=8,p=1$ format"
  );

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

  // Re-activate and test password reset + subsequent login
  updateUser(mlUser.id, { active: true });
  resetUserPassword(mlUser.id, "NewEngineerPass$99");
  assert.strictEqual(userHasCanonicalScryptHash(mlUser.id), true);
  assert.throws(() =>
    authenticateUserSession("ml_engineer_1", "EngineerPassword#2026")
  );
  const authAfterReset = authenticateUserSession("ml_engineer_1", "NewEngineerPass$99");
  assert.strictEqual(authAfterReset.user.username, "ml_engineer_1");
  console.log(
    "[PASS] 7. Secure Admin Provisioning, User Management, Legacy Migration, Session Rotation & Deactivation"
  );

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
    for (const f of stateFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
      const backup = backups.get(f);
      if (backup) {
        fs.writeFileSync(f, backup.data, { mode: backup.mode });
      }
    }
    // Ensure any restored pre-existing bootstrap admin account remains verified
    if (backups.has(usersFile)) {
      ensureBootstrapAdmin();
    }
  }

  console.log("=== ALL 9 TEST SUITES PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
