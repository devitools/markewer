#!/bin/bash
# install.sh — Markewer installer
# Usage: ./install.sh [/path/to/Markewer.app]

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $*"; }
err()  { echo -e "${RED}✗ $*${RESET}" >&2; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
info() { echo -e "  $*"; }

# ── Resolve app path ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -ge 1 ]; then
    APP_SRC="$1"
else
    APP_SRC="$SCRIPT_DIR/Markewer.app"
fi

if [ ! -d "$APP_SRC" ]; then
    err "Markewer.app not found at: $APP_SRC"
    info "Usage: $0 [/path/to/Markewer.app]"
    exit 1
fi

APP_DEST="$HOME/Applications/Markewer.app"
CLI_DEST="/usr/local/bin/markewer"
CLI_FALLBACK="$HOME/.local/bin/markewer"

echo ""
echo -e "${BOLD}Installing Markewer${RESET}"
echo "────────────────────────────────────────"

# ── 1. Copy app to ~/Applications ────────────────────────────────────────────
mkdir -p "$HOME/Applications"

echo -n "  Copying app to ~/Applications... "
rm -rf "$APP_DEST"
cp -R "$APP_SRC" "$APP_DEST"
echo -e "${GREEN}done${RESET}"

ok "App installed at $APP_DEST"

# ── 2. Remove quarantine flag ─────────────────────────────────────────────────
xattr -d com.apple.quarantine "$APP_DEST" 2>/dev/null || true
ok "Quarantine flag removed"

# ── 3. Install CLI ────────────────────────────────────────────────────────────
CLI_CONTENT='#!/bin/bash
# Markewer CLI — opens Markdown files with the Markewer app
APP="$HOME/Applications/Markewer.app"
if [ ! -d "$APP" ]; then
    echo "Markewer.app not found at $APP" >&2; exit 1
fi
if [ "$#" -eq 0 ]; then
    open "$APP"
else
    PATHS=()
    for f in "$@"; do
        abs=$(cd "$(dirname "$f")" 2>/dev/null && echo "$PWD/$(basename "$f")")
        PATHS+=("$abs")
    done
    open -n "$APP" --args "${PATHS[@]}"
fi
'

install_cli() {
    local dest="$1"
    local use_sudo="$2"
    local dir
    dir="$(dirname "$dest")"

    if [ "$use_sudo" = "true" ]; then
        echo "$CLI_CONTENT" | sudo tee "$dest" > /dev/null
        sudo chmod +x "$dest"
    else
        mkdir -p "$dir"
        echo "$CLI_CONTENT" > "$dest"
        chmod +x "$dest"
    fi
}

CLI_INSTALLED=false
CLI_LOCATION=""

# Try /usr/local/bin without sudo first
if [ -w "/usr/local/bin" ] || [ -w "/usr/local" ]; then
    mkdir -p /usr/local/bin
    install_cli "$CLI_DEST" "false"
    CLI_INSTALLED=true
    CLI_LOCATION="$CLI_DEST"
else
    # Try with sudo
    if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
        install_cli "$CLI_DEST" "true"
        CLI_INSTALLED=true
        CLI_LOCATION="$CLI_DEST"
    else
        # Fallback: try sudo interactively
        warn "/usr/local/bin requires sudo. Trying sudo (you may be prompted)..."
        if install_cli "$CLI_DEST" "true" 2>/dev/null; then
            CLI_INSTALLED=true
            CLI_LOCATION="$CLI_DEST"
        else
            warn "sudo failed. Installing to ~/.local/bin instead."
            install_cli "$CLI_FALLBACK" "false"
            CLI_INSTALLED=true
            CLI_LOCATION="$CLI_FALLBACK"
        fi
    fi
fi

if $CLI_INSTALLED; then
    ok "CLI installed at $CLI_LOCATION"
fi

# ── 4. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Markewer installed successfully!${RESET}"
echo "────────────────────────────────────────"
info "App:  ~/Applications/Markewer.app"
info "CLI:  $CLI_LOCATION"
echo ""
echo -e "${BOLD}Usage:${RESET}"
info "  markewer README.md          # Open a single file"
info "  markewer *.md               # Open multiple files"
info "  markewer                    # Launch the app"
echo ""

# Warn if CLI is in ~/.local/bin and not on PATH
if [ "$CLI_LOCATION" = "$CLI_FALLBACK" ]; then
    FALLBACK_DIR="$(dirname "$CLI_FALLBACK")"
    if [[ ":$PATH:" != *":$FALLBACK_DIR:"* ]]; then
        warn "$FALLBACK_DIR is not in your PATH."
        info "Add this to your shell profile (~/.zshrc or ~/.bash_profile):"
        echo ""
        echo -e "    ${BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
        echo ""
    fi
fi
