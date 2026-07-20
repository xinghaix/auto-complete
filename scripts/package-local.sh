#!/usr/bin/env bash
# Local dual-host package: JetBrains plugin zip + VS Code .vsix
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  fi
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

SKIP_VSCODE="${SKIP_VSCODE:-0}"
SKIP_JB="${SKIP_JB:-0}"

echo "==> JAVA_HOME=${JAVA_HOME:-"(default)"}"
echo "==> Dual package (JB zip + VS Code vsix); SKIP_JB=$SKIP_JB SKIP_VSCODE=$SKIP_VSCODE"

# ── Shared Web UI (both hosts) ──────────────────────────────────────────
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found; cannot build settings-ui / VS Code extension" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "==> npm install (workspace)"
  npm install
fi

echo "==> Build settings-ui (JCEF + Webview)"
npm run build:settings-ui

# ── JetBrains ───────────────────────────────────────────────────────────
JB_ZIP=""
if [[ "$SKIP_JB" != "1" ]]; then
  echo "==> Run core tests"
  ./gradlew :core:test

  echo "==> Build JetBrains plugin zip"
  ./gradlew :plugin:buildPlugin

  DIST_JB="$ROOT/apps/jetbrains/plugin/build/distributions"
  JB_ZIP="$(ls -1t "$DIST_JB"/auto-complete-*.zip 2>/dev/null | head -1 || true)"
  if [[ -z "$JB_ZIP" ]]; then
    JB_ZIP="$(ls -1t "$DIST_JB"/*.zip 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$JB_ZIP" ]]; then
    echo "No JetBrains zip under $DIST_JB" >&2
    exit 1
  fi
else
  echo "==> Skip JetBrains (SKIP_JB=1)"
fi

# ── VS Code ─────────────────────────────────────────────────────────────
VSIX=""
if [[ "$SKIP_VSCODE" != "1" ]]; then
  echo "==> Build core-ts + VS Code extension + package .vsix"
  npm run build:core-ts
  # package script rebuilds extension + runs vsce
  npm run package -w auto-complete

  DIST_VS="$ROOT/apps/vscode/extension/dist-vsix"
  VSIX="$(ls -1t "$DIST_VS"/auto-complete-*.vsix 2>/dev/null | head -1 || true)"
  if [[ -z "$VSIX" ]]; then
    VSIX="$(ls -1t "$DIST_VS"/*.vsix 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$VSIX" ]]; then
    echo "No VS Code vsix under $DIST_VS" >&2
    exit 1
  fi
else
  echo "==> Skip VS Code (SKIP_VSCODE=1)"
fi

# ── Summary ─────────────────────────────────────────────────────────────
echo
echo "==> Artifacts"
if [[ -n "$JB_ZIP" ]]; then
  ls -lh "$JB_ZIP"
fi
if [[ -n "$VSIX" ]]; then
  ls -lh "$VSIX"
fi

echo
if [[ -n "$JB_ZIP" ]]; then
  echo "JetBrains — Install Plugin from Disk:"
  echo "  $JB_ZIP"
fi
if [[ -n "$VSIX" ]]; then
  echo "VS Code — Extensions → Install from VSIX:"
  echo "  $VSIX"
fi
