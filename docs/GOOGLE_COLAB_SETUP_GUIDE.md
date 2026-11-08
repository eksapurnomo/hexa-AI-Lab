# HEXA AI Lab — Google Colab API & Manual Mode Setup Guide

> **Current Status**: **Manual Colab Mode is ACTIVE**.  
> Google OAuth 2.0 integration and the official Colab REST API client (`v1beta` & `v1`) are fully implemented and prepared, but live OAuth authentication is **disabled** while the Google Cloud appeal is pending.

---

## 1. Active Operational Mode: Manual Colab Mode
While the Google Cloud project appeal is pending:
- Do **not** activate live Google OAuth or attempt automated runtime provisioning.
- Enter your Manual Colab Notebook URL and tunnel endpoint in the **Google Colab Integration Settings** page (`dashboard/src/components/GoogleColabSettings.tsx`).
- Use **Test Google & Colab API (Mocked Verification)** to run non-destructive schema and configuration tests.

---

## 2. Step-by-Step Guide (For When Google Cloud Appeal is Approved)

### Step 1: Open Google Cloud Console
Navigate to [https://console.cloud.google.com/](https://console.cloud.google.com/) and sign in with the Google account that owns your **Colab Pro / Pro+** subscription.

### Step 2: Create or Select a Google Cloud Project
1. Click the project selector dropdown in the top navigation bar.
2. Select an approved Google Cloud project or create a new project.
3. Copy the **Project ID** and place it in `GOOGLE_CLOUD_PROJECT_ID` inside `/home/eksa/hexa-ai-lab/backend/.env`.

### Step 3: Enable the Google Colaboratory API
1. Go to **APIs & Services > Library** (`https://console.cloud.google.com/apis/library`).
2. Search for **Colaboratory API** (`colaboratory.googleapis.com`).
3. Click **Enable**.

### Step 4: Configure the OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **External** (or **Internal** if using Google Workspace) and click **Create**.
3. Fill in the required App Name (`HEXA AI Lab`), User Support Email, and Developer Contact Information.
4. Under **Scopes**, add the official Colab scope:
   - `https://www.googleapis.com/auth/colaboratory`
   *(Note: Google Drive permissions are NOT bundled in the Colab scope and must be authorized separately when Drive integration is enabled).*
5. Add your Colab Pro Google account under **Test users** while the app is in testing mode.

### Step 5: Create OAuth 2.0 Client ID and Client Secret
1. Go to **APIs & Services > Credentials**.
2. Click **+ Create Credentials > OAuth client ID**.
3. Choose **Web application** as the Application type.
4. Name the client `HEXA AI Lab Backend`.

### Step 6: Register the Redirect URI
Under **Authorized redirect URIs**, add the exact backend callback URL:
```text
http://127.0.0.1:3001/api/integrations/google/callback
```
Click **Create** and securely note the generated **Client ID** and **Client Secret**.

### Step 7: Enter Credentials in HEXA AI Lab
You can configure credentials via either:
- **Settings UI**: Enter the Project ID, OAuth Client ID, and OAuth Client Secret in the HEXA AI Lab Google Integration Settings panel (`Save Credentials`). They will be encrypted at rest using **AES-256-GCM** in `.colab-credentials.enc` (`0600` permissions).
- **Environment File**: Copy `/home/eksa/hexa-ai-lab/backend/.env.example` to `/home/eksa/hexa-ai-lab/backend/.env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CLOUD_PROJECT_ID`.

### Step 8: Unlock OAuth & Authorize Account with Colab Pro
Once your Google Cloud appeal is approved:
1. Set `GOOGLE_OAUTH_ENABLED=true` in `/home/eksa/hexa-ai-lab/backend/.env`.
2. Click **Authorize with Google OAuth** in the dashboard and sign in using the Google account that holds your active Colab Pro/Pro+ subscription.
3. Run the connection test to verify live `v1beta/subscription` and `v1beta/runtimespecs`.

