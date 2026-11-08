#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="/home/eksa/hexa-ai-lab"
echo "=== Verifying HEXA AI Lab Workspace at ${WORKSPACE_DIR} ==="

cd "${WORKSPACE_DIR}/backend"
echo "[1/3] Running Backend TypeScript Build & Integration Test Suite..."
npx --yes -p typescript tsc
node dist/test.js

cd "${WORKSPACE_DIR}/dashboard"
echo "[2/3] Running Dashboard TypeScript Verification..."
npx --yes -p typescript tsc --noEmit

echo "[3/3] Running Dashboard Production Build..."
npm run build

echo "=== Verification Complete: ALL CHECKS PASSED ==="
