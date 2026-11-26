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

# Do not print full JAVA_HOME (may contain a user home path). Only confirm presence.
if [[ -n "${JAVA_HOME:-}" ]]; then
  echo "==> JAVA_HOME is set (JDK for Gradle)"
else
  echo "==> JAVA_HOME not set (using default java on PATH)"
fi
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

  DIST_JB="$ROOT/apps/jetbrains/plugin/build/distributions"
  if [[ -n "${CERTIFICATE_CHAIN:-}" && -n "${PRIVATE_KEY:-}" ]]; then
    echo "==> Build + sign JetBrains plugin ZIP (CERTIFICATE_CHAIN/PRIVATE_KEY set)"
    ./gradlew :plugin:buildPlugin :plugin:signPlugin
    # Prefer signed artifact for Install from Disk / Marketplace.
    find "$DIST_JB" -type f -name '*.zip' ! -name '*-signed.zip' -delete 2>/dev/null || true
    JB_ZIP="$(ls -1t "$DIST_JB"/*-signed.zip 2>/dev/null | head -1 || true)"
  else
    echo "==> Build JetBrains plugin ZIP (unsigned — set CERTIFICATE_CHAIN+PRIVATE_KEY to sign)"
    echo "    Marketplace / release distribution should use a signed ZIP only."
    ./gradlew :plugin:buildPlugin
    JB_ZIP="$(ls -1t "$DIST_JB"/auto-complete-*.zip 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$JB_ZIP" ]]; then
    JB_ZIP="$(ls -1t "$DIST_JB"/*.zip 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$JB_ZIP" ]]; then
    echo "No JetBrains zip under $DIST_JB" >&2
    exit 1
  fi

  echo "==> Verify JetBrains plugin ZIP integrity"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$JB_ZIP" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

zip_path = Path(sys.argv[1])
forbidden = []
found_settings_ui = False
found_plugin_xml = False
change_notes_text = ""

with ZipFile(zip_path) as outer:
    for name in outer.namelist():
        base = Path(name).name.lower()
        if (base.startswith("kotlin-stdlib") or base.startswith("annotations-")) and base.endswith(".jar"):
            forbidden.append(name)
        if not name.endswith(".jar"):
            continue
        with ZipFile(BytesIO(outer.read(name))) as jar:
            entries = set(jar.namelist())
            if "settings-ui/index.html" in entries and any(e.startswith("settings-ui/assets/") for e in entries):
                found_settings_ui = True
            if "META-INF/plugin.xml" in entries:
                found_plugin_xml = True
                root = ET.fromstring(jar.read("META-INF/plugin.xml"))
                raw_notes = root.findtext("change-notes") or ""
                change_notes_text = " ".join(re.sub(r"<[^>]+>", " ", raw_notes).split())

if forbidden:
    raise SystemExit(f"Forbidden bundled JAR(s) found in JetBrains ZIP: {', '.join(forbidden)}")
if not found_settings_ui:
    raise SystemExit("JetBrains ZIP is missing embedded settings-ui/index.html or settings-ui/assets/*")
if not found_plugin_xml:
    raise SystemExit("JetBrains ZIP is missing META-INF/plugin.xml")
if not change_notes_text or change_notes_text.lower() == "open-source preview build.":
    raise SystemExit("JetBrains ZIP META-INF/plugin.xml <change-notes> is missing or placeholder")
print(f"Verified ZIP integrity: settings-ui embedded, no kotlin-stdlib/annotations JARs ({zip_path.name})")
PY
  else
    echo "python3 not found; running unzip check for forbidden JARs" >&2
    if unzip -l "$JB_ZIP" | grep -E '(^|/)(kotlin-stdlib|annotations-)[^/]*\.jar$' >/dev/null 2>&1; then
      echo "Forbidden kotlin-stdlib or annotations JAR found in $JB_ZIP" >&2
      exit 1
    fi
    echo "Warning: install python3 to also verify nested settings-ui assets and change-notes" >&2
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
  if [[ "$JB_ZIP" == *-signed.zip ]]; then
    echo "JetBrains — signed ZIP (Marketplace / Install from Disk):"
  else
    echo "JetBrains — unsigned ZIP (local only; prefer Marketplace or signed build):"
  fi
  echo "  $JB_ZIP"
  echo "  Preferred install: https://plugins.jetbrains.com/plugin/33040-auto-complete"
fi
if [[ -n "$VSIX" ]]; then
  echo "VS Code — Extensions → Install from VSIX:"
  echo "  $VSIX"
fi
