# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arandu is a Markdown viewer application built with Tauri (Rust backend + vanilla HTML/JS frontend). It uses `comrak` for GFM rendering and provides:
- GitHub Flavored Markdown support (tables, task lists, strikethrough, autolinks)
- Theme cycling (system/light/dark)
- File watching with live reload
- Sidebar outline navigation
- CLI installer for macOS
- Unix domain socket IPC for fast CLI-to-app communication
- System tray with "Show Window" and "Quit" options
- Offline voice-to-text via Whisper
- Plan review comment system

**IMPORTANT:** The macOS native version (`apps/macos/`) is DEPRECATED and no longer maintained. All active development, bug fixes, and new features happen exclusively in the Tauri version (`apps/tauri/`). Do not make changes to the macOS native version.

## Build Commands

### Tauri (requires Rust + Node.js)

**Using Makefile (recommended):**
```bash
cd apps/tauri
make dev         # run in development mode (hot reload)
make build       # production build (uses version from tauri.conf.json)
make build-dev   # local dev build with git hash (e.g. 0.0.0-abc1234)
make install     # install app to ~/Applications + CLI to /usr/local/bin
make clean       # remove build artifacts
make help        # show all available targets
```

**Using npm/npx directly:**
```bash
cd apps/tauri
npm install                          # install frontend dependencies
npx tauri dev                        # run in development mode
npx tauri build                      # production build
npx tauri build --target <triple>    # cross-compile (e.g. aarch64-apple-darwin)
```

**Local development builds:**
```bash
# Build with git hash as version (e.g. Arandu_0.0.0-05ca7c4_aarch64.dmg)
# Run from repo root:
./scripts/build-dev.sh

# This script temporarily updates version files, builds, then restores them
# Output clearly shows it's a local dev build, not an official release
```

### Version Management
```bash
scripts/set-version.sh 0.3.0  # updates Info.plist, Cargo.toml, tauri.conf.json, package.json
```

<details>
<summary>Deprecated: macOS Native (no longer maintained)</summary>

```bash
brew install xcodegen          # one-time setup
cd apps/macos
make generate                  # generate .xcodeproj from project.yml
make build                     # build Release config
make install                   # build + install app to ~/Applications + CLI to /usr/local/bin
make dist                      # build + create dist/Arandu.dmg
make clean                     # remove build artifacts and .xcodeproj
```

This version is deprecated and no longer receives updates. Use the Tauri version instead.
</details>

## Project Structure

```text
arandu/
├── .github/
│   └── workflows/
│       ├── auto-tag.yml          # Auto-versioning from conventional commits
│       ├── release.yml           # GitHub release creation
│       ├── release-tauri.yml     # Multi-platform builds (macOS/Linux/Windows)
│       └── deploy-website.yml    # Cloudflare Pages deployment
├── apps/
│   ├── macos/                    # ⚠️ DEPRECATED - macOS native app (DO NOT USE)
│   └── tauri/                    # ✓ Active development - Tauri app
│       ├── src/                  # Frontend (vanilla JS + HTML)
│       │   ├── index.html        # Full UI with modals, comment system
│       │   ├── main.js           # Single entry point
│       │   └── shared/           # Symlink to ../../shared/
│       └── src-tauri/            # Rust backend
│           ├── Cargo.toml
│           ├── tauri.conf.json
│           └── src/
│               ├── lib.rs        # Core logic, Tauri commands, app setup
│               ├── ipc_common.rs # Shared IPC types and command processing
│               ├── ipc.rs        # Unix socket IPC server (Unix only)
│               ├── tcp_ipc.rs    # TCP IPC server (all platforms)
│               ├── tray.rs       # System tray integration
│               ├── cli_installer.rs  # macOS CLI installation (macOS only)
│               ├── comments.rs   # Plan review comments storage
│               └── whisper/      # Voice-to-text module
│                   ├── mod.rs
│                   ├── audio.rs
│                   ├── commands.rs
│                   ├── model_manager.rs
│                   └── transcriber.rs
├── shared/                       # Shared CSS and highlight.js files
│   ├── style.css
│   └── highlight/
├── scripts/
│   ├── set-version.sh            # Version management across config files
│   └── build-dev.sh              # Local dev builds with git hash
├── website/                      # Static landing page (Cloudflare Pages)
├── examples/                     # Sample markdown files
└── README.md
```

## Architecture

### Tauri App (`apps/tauri/`)
- **Rust backend** (`src-tauri/src/`):
  - `lib.rs` defines all Tauri commands (`render_markdown`, `read_file`, `extract_headings`, `watch_file`, etc.) and app setup
  - `ipc_common.rs` defines shared IPC types (`IpcCommand`, `IpcResponse`) and command processing logic used by both transports
  - `ipc.rs` Unix domain socket IPC server (conditionally compiled with `#[cfg(unix)]`)
  - `tcp_ipc.rs` TCP IPC server on `127.0.0.1:7474` (all platforms, used as cross-platform fallback)
  - `tray.rs` manages system tray icon with custom-rendered "A" glyph and menu
  - `cli_installer.rs` handles macOS CLI installation (conditionally compiled with `#[cfg(target_os = "macos")]`)
  - `whisper/` handles offline voice-to-text transcription using Whisper models
  - `comments.rs` manages plan review comments storage
  - Markdown rendering via `comrak` crate, file watching via `notify` crate
- **JS frontend** (`src/`):
  - `main.js` is the single entry point — communicates with Rust via `window.__TAURI__.core.invoke()`
  - `index.html` has the full UI including CLI installer modals, whisper settings, comment system
  - No build step or bundler; plain JS served directly
  - Uses shared CSS from `shared/` directory (symlinked in `src/`)
- **Tauri plugins**: `cli` (CLI arg parsing), `dialog` (file open), `fs` (file read), `updater` (auto-update from GitHub releases)

### Inter-Process Communication

The IPC layer enables external processes to send commands to the running app. It has two transports sharing common command logic (`ipc_common.rs`):

#### Socket Server (Unix: macOS + Linux)

`ipc.rs` implements a Unix domain socket server, conditionally compiled with `#[cfg(unix)]`:

- **Socket location:** `~/.arandu/arandu.sock` (permissions: `0600`, directory: `0700`)
- **Protocol:** JSON-over-socket (one JSON object per line)
- **IPC commands** (defined in `ipc_common.rs`, shared by both transports):
  - `open` - Opens a file path in the app and focuses the window
  - `ping` - Health check, returns success
  - `show` - Brings the app window to front
- **Implementation:** Tokio async runtime, graceful cleanup on app quit

#### TCP Server (All Platforms)

`tcp_ipc.rs` implements a TCP IPC server on `127.0.0.1:7474`, available on all platforms. Uses the same JSON protocol and commands as the Unix socket transport.

#### CLI Installer (macOS Only)

`cli_installer.rs` is conditionally compiled with `#[cfg(target_os = "macos")]` and installs a bash script to `/usr/local/bin/arandu`. The CLI script workflow:

1. Tries the Unix socket first via `nc -U` (fast path, no app restart)
2. If the socket is unavailable or fails, falls back to the macOS system `open` command to launch or focus `Arandu.app` (this is the macOS `/usr/bin/open` tool, not the IPC `open` command)
3. Single instance plugin ensures only one app instance runs; subsequent invocations route through IPC

**Note:** On Linux, the socket server runs but there is no CLI installer -- users must connect to the socket directly or use the TCP server.

**Key files:**
- `apps/tauri/src-tauri/src/ipc_common.rs` - Shared IPC types and command dispatch
- `apps/tauri/src-tauri/src/ipc.rs` - Unix domain socket server
- `apps/tauri/src-tauri/src/tcp_ipc.rs` - TCP server (cross-platform)
- `apps/tauri/src-tauri/src/cli_installer.rs` - macOS CLI script installation

### Shared Assets (`shared/`)
CSS styles (`style.css`) and highlight.js files. The Tauri frontend symlinks these files in `apps/tauri/src/`.

### Website (`website/`)
Static landing page deployed to Cloudflare Pages. No build step — plain HTML/CSS/JS.

## Release Process

Triggered by pushing a `v*` tag:
1. `release.yml` creates a draft GitHub release with auto-generated changelog
2. `release-tauri.yml` builds Tauri for 4 targets: macOS ARM, macOS Intel, Linux x86_64, Windows x86_64
3. After all builds succeed, the release is published (draft → public)

The website auto-deploys via `deploy-website.yml` on push to `main` when `website/**` changes.

## Key Conventions

- The project language is primarily Portuguese (README, commit messages may mix PT/EN)
- Bundle identifier: `com.devitools.arandu`
- macOS minimum deployment target: 13.0
- Tauri commands are the bridge between JS and Rust — any new backend functionality needs a `#[tauri::command]` function registered in the `invoke_handler`
- Conditional compilation is used extensively: `#[cfg(target_os = "macos")]` for macOS-specific features like CLI installer, `#[cfg(unix)]` for IPC socket functionality
- IPC socket communication is Unix-only and gracefully degrades if setup fails (logs error but doesn't block app startup)
- The `withGlobalTauri: true` setting exposes Tauri APIs on `window.__TAURI__` (no import needed in JS)
