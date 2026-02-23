# Arandu

A minimal, cross-platform Markdown viewer with plan review comments and voice-to-text transcription. Powered by [Tauri](https://tauri.app).

![macOS](https://img.shields.io/badge/macOS-13%2B-blue)
![Linux](https://img.shields.io/badge/Linux-x86__64-orange)
![Windows](https://img.shields.io/badge/Windows-x86__64-green)

## Features

### Document Viewing
- GitHub Flavored Markdown rendering (tables, task lists, strikethrough, autolinks)
- Syntax highlighting for 190+ languages
- Sidebar outline navigation with smooth scrolling
- Live reload on file save
- Dark / light / system theme cycling

### Productivity Tools
- **Plan review comments** — GitHub-style inline comments for markdown files with AI prompt generation
- **Voice to text** — Built-in speech transcription powered by OpenAI Whisper (offline, 4 model sizes)

### CLI
- `arandu README.md` — Open files from terminal
- Installable via Homebrew (macOS) or manual download

## Installation

### macOS (Homebrew)

```bash
brew install --cask devitools/arandu/arandu
```

### Manual Download

Download the latest release for your platform from the
[GitHub Releases](https://github.com/devitools/arandu/releases/latest) page:

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Linux | `.AppImage`, `.deb` |
| Windows | `.exe` |

> On first launch (macOS), the app offers to install the `arandu` CLI automatically.
> It can also be installed later via the menu: **Arandu → Install Command Line Tool…**

## Usage

```bash
arandu README.md           # open a file
arandu doc1.md doc2.md     # open multiple files
arandu *.md                # open all .md files in the current directory
arandu                     # opens the file picker
```

## Advanced Features

### Plan Review Comments

Add inline comments to markdown blocks, track unresolved feedback, and generate consolidated review prompts for AI coding assistants. Comments persist in `.comments.json` sidecar files alongside your markdown.

**Usage:**
- Cmd/Ctrl+Click blocks to select and comment
- Bottom panel shows all comments with block indicators (H2, P3, C4, etc.)
- Generate review prompts with quoted context for AI tools

### Voice to Text

Record audio and transcribe to text using OpenAI Whisper models (runs locally, no API keys needed).

**Usage:**
- Alt+Space to start recording (configurable)
- Choose model size: tiny (75MB, fastest) to medium (1.5GB, most accurate)
- Transcription automatically copies to clipboard
- Select audio input device from settings

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Node.js](https://nodejs.org) 20+

### Run locally

```bash
cd apps/tauri
npm install
npx tauri dev
```

### Production build

```bash
cd apps/tauri
npx tauri build
```

### Set version across all configs

```bash
scripts/set-version.sh 0.3.0
```
