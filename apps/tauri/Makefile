.PHONY: help dev build build-dev clean install

# Directories
BUILD_DIR = src-tauri/target/release
BUNDLE_DIR = $(BUILD_DIR)/bundle/macos
APP_NAME = Arandu.app
APP_DEST = $(HOME)/Applications/$(APP_NAME)
CLI_DEST = /usr/local/bin/arandu

help:
	@echo "Arandu Tauri - Build targets:"
	@echo ""
	@echo "  make dev        - Run in development mode (hot reload)"
	@echo "  make build      - Production build (uses version from tauri.conf.json)"
	@echo "  make build-dev  - Local dev build with git hash (0.0.0-{hash})"
	@echo "  make install    - Install app to ~/Applications and CLI to /usr/local/bin"
	@echo "  make clean      - Remove build artifacts"
	@echo ""
	@echo "Examples:"
	@echo "  make build-dev  # Creates Arandu_0.0.0-abc1234_aarch64.dmg"
	@echo "  make install    # Installs the built app locally"

dev:
	@echo "🚀 Starting Tauri in development mode..."
	npm run tauri dev

build:
	@echo "📦 Building Tauri app (production)..."
	npx tauri build

build-dev:
	@echo "🔨 Building local dev version with git hash..."
	@../../scripts/build-dev.sh

install:
	@if [ ! -d "$(BUNDLE_DIR)/$(APP_NAME)" ]; then \
		echo "❌ App not found. Run 'make build' or 'make build-dev' first."; \
		exit 1; \
	fi
	@mkdir -p "$(HOME)/Applications"
	@echo "Installing $(APP_NAME) to ~/Applications..."
	@cp -R "$(BUNDLE_DIR)/$(APP_NAME)" "$(APP_DEST)"
	@echo "Installing CLI to $(CLI_DEST)..."
	@if [ -f "../../scripts/arandu" ]; then \
		sudo cp ../../scripts/arandu "$(CLI_DEST)"; \
		sudo chmod +x "$(CLI_DEST)"; \
	else \
		echo "⚠️  CLI script not found at scripts/arandu"; \
	fi
	@echo "✅ Done. Use 'arandu README.md' to open files."

clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf src-tauri/target
	@echo "✅ Clean complete."
