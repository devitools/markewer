.PHONY: all generate build install install-script uninstall clean dist

SCHEME      = Markewer
CONFIG      = Release
BUILD_DIR   = build
APP_NAME    = Markewer.app
APP_DEST    = $(HOME)/Applications/$(APP_NAME)
CLI_DEST    = /usr/local/bin/markewer

all: generate build

generate:
	xcodegen generate

build: generate
	xcodebuild \
	    -scheme $(SCHEME) \
	    -configuration $(CONFIG) \
	    -derivedDataPath $(BUILD_DIR) \
	    CODE_SIGN_IDENTITY="-" \
	    CODE_SIGNING_REQUIRED=NO \
	    CODE_SIGNING_ALLOWED=NO \
	    $(if $(shell which xcpretty 2>/dev/null),| xcpretty,)

install: build
	@echo "Installing $(APP_NAME) to /Applications..."
	cp -R "$(BUILD_DIR)/Build/Products/$(CONFIG)/$(APP_NAME)" "$(APP_DEST)"
	@echo "Installing CLI to $(CLI_DEST)..."
	cp scripts/markewer "$(CLI_DEST)"
	chmod +x "$(CLI_DEST)"
	@echo "✅ Done. Use 'markewer README.md' to open files."

install-script:
	@DMG=$$(ls $(BUILD_DIR)/*.dmg 2>/dev/null | head -1); \
	if [ -n "$$DMG" ]; then \
	    DMG_DIR=$$(dirname "$$DMG"); \
	    cp scripts/install.sh "$$DMG_DIR/install.sh"; \
	    echo "✅ install.sh copied to $$DMG_DIR/"; \
	    echo "   Distribute both files: $$(basename $$DMG) + install.sh"; \
	else \
	    echo "⚠️  No .dmg found in $(BUILD_DIR)/. Run 'make build' first."; \
	    echo "   Script is at: scripts/install.sh"; \
	    echo "   Usage: ./install.sh [/path/to/Markewer.app]"; \
	fi

uninstall:
	@echo "Removing $(APP_DEST)..."
	rm -rf "$(APP_DEST)"
	@echo "Removing $(CLI_DEST)..."
	rm -f "$(CLI_DEST)"

clean:
	rm -rf $(BUILD_DIR)
	rm -rf Markewer.xcodeproj

dist: build
	@echo "📦 Creating DMG..."
	@mkdir -p dist
	@rm -f dist/Markewer-1.0.dmg
	@TMP_DIR=$$(mktemp -d) && \
	    cp -R "$(BUILD_DIR)/Build/Products/$(CONFIG)/$(APP_NAME)" "$$TMP_DIR/$(APP_NAME)" && \
	    ln -s /Applications "$$TMP_DIR/Applications" && \
	    hdiutil create \
	        -volname "Markewer" \
	        -srcfolder "$$TMP_DIR" \
	        -ov -format UDZO \
	        dist/Markewer-1.0.dmg && \
	    rm -rf "$$TMP_DIR"
	@echo "✅ DMG criado em: dist/Markewer-1.0.dmg"
