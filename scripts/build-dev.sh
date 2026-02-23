#!/usr/bin/env bash
# build-dev.sh - Build Tauri app with git hash as version for local development
#
# Usage: ./scripts/build-dev.sh [tauri build options]
#
# This script builds the Tauri app with version 0.0.0-{git-hash} to clearly
# distinguish local development builds from official releases. It temporarily
# updates version files, builds the app, then restores the original files.
#
# Example output: Arandu_0.0.0-05ca7c4_aarch64.dmg

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Get current git hash
HASH=$(git rev-parse --short HEAD)

# Use 0.0.0 with hash for local builds
DEV_VERSION="0.0.0-${HASH}"

echo "Building Arandu v${DEV_VERSION} (local dev build)..."

# Backup original files
cp apps/tauri/src-tauri/tauri.conf.json apps/tauri/src-tauri/tauri.conf.json.bak
cp apps/tauri/src-tauri/Cargo.toml apps/tauri/src-tauri/Cargo.toml.bak
cp apps/tauri/package.json apps/tauri/package.json.bak

# Trap to restore files on exit (success or failure)
trap 'mv apps/tauri/src-tauri/tauri.conf.json.bak apps/tauri/src-tauri/tauri.conf.json 2>/dev/null || true; mv apps/tauri/src-tauri/Cargo.toml.bak apps/tauri/src-tauri/Cargo.toml 2>/dev/null || true; mv apps/tauri/package.json.bak apps/tauri/package.json 2>/dev/null || true' EXIT

# Set dev version
"$ROOT/scripts/set-version.sh" "$DEV_VERSION"

# Build
cd apps/tauri
npx tauri build "$@"

echo ""
echo "✅ Done! DMG created with version ${DEV_VERSION}"
echo "   This is a local development build and should not be distributed."
