import React, { useState } from "react";
import { AuthenticatedUser } from "../types/colab";

export interface LoginScreenProps {
  apiBaseUrl?: string;
  csrfToken: string;
  onLoginSuccess: (user: AuthenticatedUser, nextCsrfToken: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  apiBaseUrl = "",
  csrfToken,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const payload = (await res.json()) as {
        authenticated?: boolean;
        user?: AuthenticatedUser;
        csrfToken?: string;
        error?: string;
      };

      setPassword("");

      if (!res.ok || !payload.authenticated || !payload.user) {
        setErrorMessage(payload.error || "Invalid username or password.");
        return;
      }

      onLoginSuccess(payload.user, payload.csrfToken || csrfToken);
    } catch {
      setPassword("");
      setErrorMessage("Unable to reach authentication service on 127.0.0.1.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hexa-login-viewport">
      <div className="hexa-card login-card">
        <div className="login-brand-header">
          <div className="login-logo-box">
            <img
              src="/brand/inexa-light-logo.png"
              alt="inexa.space"
              className="login-logo-img"
              width={210}
              height={65}
            />
          </div>
          <div className="login-brand-titles">
            <span className="brand-primary-domain">inexa.space</span>
            <h1 className="login-title">HEXA AI Lab</h1>
            <p className="login-subtitle">
              Model Training, Compute &amp; Infrastructure Control Plane
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="alert-banner alert-error" role="alert">
            {errorMessage}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field full-width">
            <label htmlFor="hexa-login-username">Username</label>
            <input
              id="hexa-login-username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setUsername(e.target.value)
              }
            />
          </div>

          <div className="form-field full-width">
            <label htmlFor="hexa-login-password">Password</label>
            <input
              id="hexa-login-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
            />
          </div>

          <button
            type="submit"
            className="btn-primary login-submit-btn"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In to HEXA AI Lab"}
          </button>
        </form>

        <div className="login-security-footer">
          <span className="status-dot dot-teal" />
          <span>
            Protected by HttpOnly Session Cookies, CSRF Guard &amp; Salted Password Hashing
          </span>
        </div>
      </div>
    </div>
  );
};

