import crypto from "crypto";
import fs from "fs";
import path from "path";
import { encryptSecret, decryptSecret } from "../colab/crypto";
import { hashPassword, verifyPassword, validatePasswordStrength } from "./password";

export type UserRole =
  | "Admin"
  | "ML Engineer"
  | "Dataset Contributor"
  | "Reviewer";

export const VALID_USER_ROLES: readonly UserRole[] = [
  "Admin",
  "ML Engineer",
  "Dataset Contributor",
  "Reviewer",
];

export interface StoredUserRecord {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PublicUserRecord {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,48}$/;

function getSafeFilePath(filename: string): string {
  const baseDir = path.resolve(process.cwd());
  const cleanName = path.basename(filename);
  const resolved = path.resolve(baseDir, cleanName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error("Security violation: Storage path escapes workspace boundary.");
  }
  return resolved;
}

function toPublicUser(u: StoredUserRecord): PublicUserRecord {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function loadUsersRaw(): StoredUserRecord[] {
  const filePath = getSafeFilePath(".hexa-users.enc");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const decrypted = decryptSecret(raw);
    const parsed = JSON.parse(decrypted);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredUserRecord[];
  } catch {
    return [];
  }
}

function saveUsersRaw(users: StoredUserRecord[]): void {
  const filePath = getSafeFilePath(".hexa-users.enc");
  const encrypted = encryptSecret(JSON.stringify(users));
  fs.writeFileSync(filePath, encrypted, { encoding: "utf8", mode: 0o600 });
}

function loadSessionsRaw(): SessionRecord[] {
  const filePath = getSafeFilePath(".hexa-sessions.enc");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const decrypted = decryptSecret(raw);
    const parsed = JSON.parse(decrypted);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return (parsed as SessionRecord[]).filter((s) => s.expiresAt > now);
  } catch {
    return [];
  }
}

function saveSessionsRaw(sessions: SessionRecord[]): void {
  const filePath = getSafeFilePath(".hexa-sessions.enc");
  const now = Date.now();
  const activeSessions = sessions.filter((s) => s.expiresAt > now);
  const encrypted = encryptSecret(JSON.stringify(activeSessions));
  fs.writeFileSync(filePath, encrypted, { encoding: "utf8", mode: 0o600 });
}

/**
 * Resolves bootstrap administrator credentials using multi-tiered resolution:
 * 1. Environment variables (HEXA_BOOTSTRAP_ADMIN_USERNAME / HEXA_BOOTSTRAP_ADMIN_PASSWORD)
 * 2. Local secret file (.bootstrap_admin.secret)
 * 3. Ephemeral CSPRNG secret persisted to .bootstrap_admin.secret (for local non-prod convenience)
 * Never hardcodes a literal default password in source code.
 */
function resolveBootstrapAdminCredentials(): {
  username: string;
  password: string;
  displayName: string;
} | null {
  const username = (
    process.env.HEXA_BOOTSTRAP_ADMIN_USERNAME || "admin"
  ).trim();
  const displayName = (
    process.env.HEXA_BOOTSTRAP_ADMIN_DISPLAY_NAME || "HEXA Lab Administrator"
  ).trim();

  if (
    process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD &&
    process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD.trim().length >= 8
  ) {
    return {
      username,
      password: process.env.HEXA_BOOTSTRAP_ADMIN_PASSWORD.trim(),
      displayName,
    };
  }

  const secretFile = getSafeFilePath(".bootstrap_admin.secret");
  if (fs.existsSync(secretFile)) {
    const stored = fs.readFileSync(secretFile, "utf8").trim();
    if (stored.length >= 8) {
      return { username, password: stored, displayName };
    }
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const generatedPassword = `Hexa!${crypto.randomBytes(12).toString("base64url")}`;
  fs.writeFileSync(secretFile, generatedPassword, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.warn(
    "[AuthBootstrap] Generated instance-local bootstrap admin secret in .bootstrap_admin.secret (0600)."
  );
  return { username, password: generatedPassword, displayName };
}

/**
 * Creates the first administrator if and only if no administrator exists yet.
 * Never overwrites existing administrators.
 */
export function ensureBootstrapAdmin(): void {
  const existingUsers = loadUsersRaw();
  const hasAdmin = existingUsers.some((u) => u.role === "Admin");
  if (hasAdmin) {
    return;
  }

  const creds = resolveBootstrapAdminCredentials();
  if (!creds) {
    return;
  }

  if (!USERNAME_REGEX.test(creds.username)) {
    throw new Error("Invalid bootstrap administrator username format.");
  }

  const newAdmin: StoredUserRecord = {
    id: `usr_${crypto.randomBytes(8).toString("hex")}`,
    username: creds.username,
    displayName: creds.displayName,
    role: "Admin",
    active: true,
    passwordHash: hashPassword(creds.password),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  existingUsers.push(newAdmin);
  saveUsersRaw(existingUsers);
}

export function listUsers(): PublicUserRecord[] {
  ensureBootstrapAdmin();
  return loadUsersRaw().map(toPublicUser);
}

export function getUserById(userId: string): PublicUserRecord | null {
  ensureBootstrapAdmin();
  const found = loadUsersRaw().find((u) => u.id === userId);
  return found ? toPublicUser(found) : null;
}

export function createUser(input: {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
}): PublicUserRecord {
  ensureBootstrapAdmin();
  const username = (input.username || "").trim();
  const displayName = (input.displayName || "").trim();
  const role = input.role;

  if (!USERNAME_REGEX.test(username)) {
    throw new Error(
      "Username must be 3-48 characters and contain only letters, numbers, '.', '_', or '-'."
    );
  }
  if (!displayName || displayName.length > 80) {
    throw new Error("Display name is required and must be at most 80 characters.");
  }
  if (!VALID_USER_ROLES.includes(role)) {
    throw new Error("Invalid user role specified.");
  }

  const pwCheck = validatePasswordStrength(input.password);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.error || "Invalid password.");
  }

  const users = loadUsersRaw();
  const duplicate = users.some(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Username '${username}' is already registered.`);
  }

  const record: StoredUserRecord = {
    id: `usr_${crypto.randomBytes(8).toString("hex")}`,
    username,
    displayName,
    role,
    active: true,
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  users.push(record);
  saveUsersRaw(users);
  return toPublicUser(record);
}

export function updateUser(
  userId: string,
  updates: {
    username?: string;
    displayName?: string;
    role?: UserRole;
    active?: boolean;
  }
): PublicUserRecord {
  ensureBootstrapAdmin();
  const users = loadUsersRaw();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    throw new Error("User not found.");
  }

  const target = { ...users[idx] };

  if (updates.username !== undefined) {
    const nextUsername = updates.username.trim();
    if (!USERNAME_REGEX.test(nextUsername)) {
      throw new Error(
        "Username must be 3-48 characters and contain only letters, numbers, '.', '_', or '-'."
      );
    }
    const collision = users.some(
      (u, i) =>
        i !== idx && u.username.toLowerCase() === nextUsername.toLowerCase()
    );
    if (collision) {
      throw new Error(`Username '${nextUsername}' is already in use.`);
    }
    target.username = nextUsername;
  }

  if (updates.displayName !== undefined) {
    const nextDisplay = updates.displayName.trim();
    if (!nextDisplay || nextDisplay.length > 80) {
      throw new Error("Display name is required and must be at most 80 characters.");
    }
    target.displayName = nextDisplay;
  }

  if (updates.role !== undefined) {
    if (!VALID_USER_ROLES.includes(updates.role)) {
      throw new Error("Invalid user role specified.");
    }
    target.role = updates.role;
  }

  if (updates.active !== undefined) {
    target.active = Boolean(updates.active);
  }

  // Prevent locking out the last active Admin
  const remainingActiveAdmins = users.filter((u, i) => {
    const candidate = i === idx ? target : u;
    return candidate.role === "Admin" && candidate.active;
  });
  if (remainingActiveAdmins.length === 0) {
    throw new Error("Cannot deactivate or demote the last active Administrator.");
  }

  users[idx] = target;
  saveUsersRaw(users);

  // If user was deactivated, immediately invalidate all their sessions
  if (!target.active) {
    invalidateUserSessions(userId);
  }

  return toPublicUser(target);
}

export function resetUserPassword(userId: string, newPassword: string): PublicUserRecord {
  ensureBootstrapAdmin();
  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.error || "Invalid password.");
  }

  const users = loadUsersRaw();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    throw new Error("User not found.");
  }

  users[idx] = {
    ...users[idx],
    passwordHash: hashPassword(newPassword),
  };
  saveUsersRaw(users);

  // Invalidate all existing sessions for this user after password reset
  invalidateUserSessions(userId);
  return toPublicUser(users[idx]);
}

export function authenticateUserSession(
  usernameInput: string,
  passwordInput: string,
  previousSessionId?: string
): {
  user: PublicUserRecord;
  session: SessionRecord;
} {
  ensureBootstrapAdmin();
  const username = (usernameInput || "").trim();
  if (!username || !passwordInput) {
    throw new Error("Invalid username or password.");
  }

  const users = loadUsersRaw();
  const idx = users.findIndex(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
  if (idx === -1) {
    // Perform dummy verification to mitigate timing enumeration
    verifyPassword(
      passwordInput,
      "$2b$12$......................1234567890123456789012345678901"
    );
    throw new Error("Invalid username or password.");
  }

  const user = users[idx];
  if (!user.active) {
    throw new Error("Account is deactivated. Contact an administrator.");
  }

  const valid = verifyPassword(passwordInput, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid username or password.");
  }

  const nowIso = new Date().toISOString();
  users[idx] = {
    ...user,
    lastLoginAt: nowIso,
  };
  saveUsersRaw(users);

  // Session rotation: remove previous session if present and issue a brand new session ID
  let sessions = loadSessionsRaw();
  if (previousSessionId) {
    sessions = sessions.filter((s) => s.sessionId !== previousSessionId);
  }

  const newSession: SessionRecord = {
    sessionId: crypto.randomBytes(32).toString("hex"),
    userId: user.id,
    csrfToken: crypto.randomBytes(32).toString("hex"),
    createdAt: nowIso,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessions.push(newSession);
  saveSessionsRaw(sessions);

  return {
    user: toPublicUser(users[idx]),
    session: newSession,
  };
}

export function validateSessionToken(sessionId: string | undefined | null): {
  user: PublicUserRecord;
  session: SessionRecord;
} | null {
  if (!sessionId || typeof sessionId !== "string" || sessionId.length < 32) {
    return null;
  }
  const sessions = loadSessionsRaw();
  const session = sessions.find((s) => s.sessionId === sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  const users = loadUsersRaw();
  const user = users.find((u) => u.id === session.userId);
  if (!user || !user.active) {
    return null;
  }

  return {
    user: toPublicUser(user),
    session,
  };
}

export function invalidateSession(sessionId: string | undefined | null): void {
  if (!sessionId) return;
  const sessions = loadSessionsRaw().filter((s) => s.sessionId !== sessionId);
  saveSessionsRaw(sessions);
}

export function invalidateUserSessions(userId: string): void {
  const sessions = loadSessionsRaw().filter((s) => s.userId !== userId);
  saveSessionsRaw(sessions);
}

