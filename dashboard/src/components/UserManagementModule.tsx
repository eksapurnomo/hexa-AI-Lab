import React, { useState, useEffect, useCallback } from "react";
import { AuthenticatedUser, UserRole } from "../types/colab";

export interface UserManagementModuleProps {
  apiBaseUrl?: string;
  adminToken?: string;
  csrfToken: string;
  currentUser: AuthenticatedUser;
}

const ROLE_OPTIONS: UserRole[] = [
  "Admin",
  "ML Engineer",
  "Dataset Contributor",
  "Reviewer",
];

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({
  apiBaseUrl = "",
  adminToken = "",
  csrfToken,
  currentUser,
}) => {
  const [users, setUsers] = useState<AuthenticatedUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Create user form state
  const [newUsername, setNewUsername] = useState<string>("");
  const [newDisplayName, setNewDisplayName] = useState<string>("");
  const [newRole, setNewRole] = useState<UserRole>("ML Engineer");
  const [newPassword, setNewPassword] = useState<string>("");

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState<string>("");
  const [editDisplayName, setEditDisplayName] = useState<string>("");
  const [editRole, setEditRole] = useState<UserRole>("Reviewer");

  // Reset password state
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState<string>("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;
      const res = await fetch(`${apiBaseUrl}/api/users`, {
        method: "GET",
        credentials: "include",
        headers,
        cache: "no-store",
      });
      const data = (await res.json()) as {
        users?: AuthenticatedUser[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setUsers(data.users || []);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load user directory."
      );
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminToken]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/users/create`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim(),
          role: newRole,
          password: newPassword,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user.");
      }
      setNewUsername("");
      setNewDisplayName("");
      setNewPassword("");
      setNotice(data.message || "User created successfully.");
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create user.");
    }
  };

  const handleStartEdit = (u: AuthenticatedUser) => {
    setEditingUserId(u.id);
    setEditUsername(u.username);
    setEditDisplayName(u.displayName);
    setEditRole(u.role);
    setNotice(null);
    setErrorMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setNotice(null);
    setErrorMsg(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/users/update`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          id: editingUserId,
          username: editUsername.trim(),
          displayName: editDisplayName.trim(),
          role: editRole,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user.");
      }
      setEditingUserId(null);
      setNotice(data.message || "User updated.");
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update user.");
    }
  };

  const handleToggleActive = async (u: AuthenticatedUser) => {
    setNotice(null);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/users/update`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          id: u.id,
          active: !u.active,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user status.");
      }
      setNotice(
        `User '${u.username}' ${!u.active ? "activated" : "deactivated"}.`
      );
      await fetchUsers();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to update user status."
      );
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetId) return;
    setNotice(null);
    setErrorMsg(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      };
      if (adminToken) headers["X-Hexa-Admin-Token"] = adminToken;

      const res = await fetch(`${apiBaseUrl}/api/users/reset-password`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          id: resetTargetId,
          newPassword: resetPasswordInput,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Password reset failed.");
      }
      setResetTargetId(null);
      setResetPasswordInput("");
      setNotice(data.message || "Password reset successfully.");
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Password reset failed.");
    }
  };

  if (currentUser.role !== "Admin") {
    return (
      <div className="module-container">
        <div className="alert-banner alert-error" role="alert">
          Access Denied: User Management is restricted to Administrators.
        </div>
      </div>
    );
  }

  return (
    <div className="module-container">
      <header className="module-header">
        <div>
          <span className="module-eyebrow">inexa.space — Role-Based Access Control</span>
          <h1 className="module-title">User Management</h1>
          <p className="module-subtitle">
            Manage HEXA AI Lab accounts, roles (Admin, ML Engineer, Dataset Contributor, Reviewer),
            activation status, and password resets.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchUsers()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Users"}
          </button>
        </div>
      </header>

      {notice && (
        <div className="alert-banner alert-teal" role="status">
          {notice}
        </div>
      )}

      {errorMsg && (
        <div className="alert-banner alert-error" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="two-col-layout">
        {/* Create New User Form */}
        <form className="hexa-card form-card" onSubmit={handleCreateUser}>
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Create User Account</h2>
              <p className="section-subtitle">
                Passwords are salted and hashed with scrypt (N=16384, r=8, p=1) on the backend.
              </p>
            </div>
            <span className="status-badge badge-teal">Admin Only</span>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="new-user-username">Username</label>
              <input
                id="new-user-username"
                type="text"
                placeholder="e.g. ml_engineer_01"
                value={newUsername}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewUsername(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-user-display">Display Name</label>
              <input
                id="new-user-display"
                type="text"
                placeholder="e.g. Sari Pratama"
                value={newDisplayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewDisplayName(e.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="new-user-role">Assigned Role</label>
              <select
                id="new-user-role"
                value={newRole}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setNewRole(e.target.value as UserRole)
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="new-user-password">Initial Password (min 8 chars)</label>
              <input
                id="new-user-password"
                type="password"
                placeholder="Strong initial password"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPassword(e.target.value)
                }
              />
            </div>
          </div>

          <div className="form-footer">
            <button type="submit" className="btn-primary">
              Create User
            </button>
          </div>
        </form>

        {/* Edit User / Reset Password Panel */}
        <div className="hexa-card">
          {editingUserId ? (
            <form onSubmit={handleSaveEdit}>
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">Edit User Profile &amp; Role</h2>
                  <p className="section-subtitle">Update username, display name, or RBAC role.</p>
                </div>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => setEditingUserId(null)}
                >
                  Cancel
                </button>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="edit-user-username">Username</label>
                  <input
                    id="edit-user-username"
                    type="text"
                    value={editUsername}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditUsername(e.target.value)
                    }
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="edit-user-display">Display Name</label>
                  <input
                    id="edit-user-display"
                    type="text"
                    value={editDisplayName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditDisplayName(e.target.value)
                    }
                  />
                </div>
                <div className="form-field full-width">
                  <label htmlFor="edit-user-role">Role</label>
                  <select
                    id="edit-user-role"
                    value={editRole}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setEditRole(e.target.value as UserRole)
                    }
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-footer">
                <button type="submit" className="btn-primary">
                  Save User Changes
                </button>
              </div>
            </form>
          ) : resetTargetId ? (
            <form onSubmit={handleResetPassword}>
              <div className="section-header-row">
                <div>
                  <h2 className="section-title">Reset User Password</h2>
                  <p className="section-subtitle">
                    Setting a new password immediately invalidates all active sessions for that user.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => {
                    setResetTargetId(null);
                    setResetPasswordInput("");
                  }}
                >
                  Cancel
                </button>
              </div>
              <div className="form-field full-width">
                <label htmlFor="reset-user-pw">New Password (min 8 characters)</label>
                <input
                  id="reset-user-pw"
                  type="password"
                  placeholder="Enter new strong password"
                  value={resetPasswordInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setResetPasswordInput(e.target.value)
                  }
                />
              </div>
              <div className="form-footer">
                <button type="submit" className="btn-primary">
                  Confirm Password Reset
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2 className="section-title">Role Permissions Matrix</h2>
              <p className="section-subtitle">
                Enforced server-side on all HEXA AI Lab API endpoints.
              </p>
              <table className="hexa-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Access Scope</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Admin</strong>
                    </td>
                    <td>
                      Full access: User Management, Infrastructure, Colab Credentials, Training &amp;
                      Datasets
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>ML Engineer</strong>
                    </td>
                    <td>Model Training configurator, Training Jobs, Evaluation &amp; Model Registry</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Dataset Contributor</strong>
                    </td>
                    <td>Dataset preparation, schema validation &amp; Overview visibility</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Reviewer</strong>
                    </td>
                    <td>Read-only access to Overview, Evaluation &amp; Model Registry</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Registered Users Directory Table */}
      <section className="hexa-card" aria-label="Registered Users">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Registered Accounts ({users.length})</h2>
            <p className="section-subtitle">
              Encrypted user store (<code>.hexa-users.enc</code>). Plaintext passwords are never
              stored.
            </p>
          </div>
        </div>

        <table className="hexa-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono">
                  <strong>{u.username}</strong>
                </td>
                <td>{u.displayName}</td>
                <td>
                  <span
                    className={
                      u.role === "Admin"
                        ? "status-badge badge-teal"
                        : "status-badge badge-neutral"
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td>
                  <span
                    className={
                      u.active
                        ? "status-badge badge-teal"
                        : "status-badge badge-amber"
                    }
                  >
                    {u.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="font-mono">{u.createdAt ? u.createdAt.slice(0, 10) : "-"}</td>
                <td className="font-mono">
                  {u.lastLoginAt ? u.lastLoginAt.slice(0, 19).replace("T", " ") : "Never"}
                </td>
                <td>
                  <div className="table-action-row">
                    <button
                      type="button"
                      className="btn-outline-sm"
                      onClick={() => handleStartEdit(u)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-outline-sm"
                      onClick={() => {
                        setResetTargetId(u.id);
                        setEditingUserId(null);
                      }}
                    >
                      Reset Password
                    </button>
                    <button
                      type="button"
                      className="btn-outline-sm"
                      onClick={() => void handleToggleActive(u)}
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

