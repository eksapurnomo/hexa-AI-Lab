# HEXA AI Lab

Dedicated workspace for **HEXA AI Lab** located at `/home/eksa/hexa-ai-lab`.

## Project Structure

```text
hexa-ai-lab/
├── dashboard/    # React + TypeScript Dashboard UI
├── backend/      # Lightweight Node.js TypeScript Backend API & Colab Client
├── docs/         # Setup & Architecture Documentation
├── scripts/      # Verification & Operational Scripts
├── .env.example  # Root Environment Variable Template
└── README.md     # Project Overview
```

## Key Features Implemented

1. **Official Google Colab REST API Client (`backend/src/colab/client.ts`)**:
   - Supports `v1beta` (`getSubscription`, `listRuntimeSpecs`, `createRuntime`, `listRuntimes`, `getRuntime`, `deleteRuntime`) and `v1` (`getOperation`, `listOperations`, `waitOperation`).
2. **OAuth 2.0 Prepared & Safely Disabled (`backend/src/colab/oauth.ts`)**:
   - Implements full authorization code flow, CSRF state verification, and redirect URI validation, while remaining safely disabled pending Google Cloud appeal approval.
3. **Manual Colab Mode Active (`backend/src/colab/storage.ts`)**:
   - Currently active mode allowing manual Colab runtime configuration and non-destructive mocked connection verification.
4. **AES-256-GCM Encrypted Storage (`backend/src/colab/crypto.ts`)**:
   - Encrypts sensitive credentials at rest with `scrypt` key derivation and masks secrets in all API responses.
5. **Admin-Only Security Middleware (`backend/src/middleware/security.ts`)**:
   - Enforces administrator token verification, CSRF protection, rate limiting, and strict HTTP security headers bound to `127.0.0.1`.

