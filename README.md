# Arandu

A minimal, cross-platform Markdown viewer powered by [Tauri](https://tauri.app).

![macOS](https://img.shields.io/badge/macOS-13%2B-blue)
![Linux](https://img.shields.io/badge/Linux-x86__64-orange)
![Windows](https://img.shields.io/badge/Windows-x86__64-green)

## Features

- GitHub Flavored Markdown rendering (tables, task lists, strikethrough, autolinks)
- Syntax highlighting for code blocks
- Dark / light / system theme cycling
- Sidebar outline navigation
- Live reload on file save
- CLI: `arandu README.md`

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
