import AppKit
import WebKit
import libcmark_gfm

// MARK: - Heading model

struct Heading {
    let level: Int   // 1-6
    let text: String
    let index: Int   // sequential index for JS anchor
}

func extractHeadings(from markdown: String) -> [Heading] {
    var headings: [Heading] = []
    var index = 0
    var inCodeBlock = false
    for line in markdown.components(separatedBy: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("```") {
            inCodeBlock = !inCodeBlock
            continue
        }
        if inCodeBlock { continue }
        var level = 0
        for ch in trimmed { if ch == "#" { level += 1 } else { break } }
        if level >= 1 && level <= 4 && trimmed.count > level {
            let next = trimmed.index(trimmed.startIndex, offsetBy: level)
            let raw = String(trimmed[next...]).trimmingCharacters(in: .whitespaces)
            if !raw.isEmpty {
                headings.append(Heading(level: level, text: raw, index: index))
                index += 1
            }
        }
    }
    return headings
}

// MARK: - Markdown rendering

func renderMarkdown(_ text: String) -> String {
    cmark_gfm_core_extensions_ensure_registered()
    guard let parser = cmark_parser_new(CMARK_OPT_DEFAULT) else { return text }
    defer { cmark_parser_free(parser) }
    for name in ["table", "tasklist", "strikethrough", "autolink"] {
        if let ext = cmark_find_syntax_extension(name) {
            cmark_parser_attach_syntax_extension(parser, ext)
        }
    }
    cmark_parser_feed(parser, text, text.utf8.count)
    guard let doc = cmark_parser_finish(parser) else { return text }
    defer { cmark_node_free(doc) }
    guard let ptr = cmark_render_html(doc, CMARK_OPT_DEFAULT, nil) else { return text }
    defer { free(ptr) }
    return String(cString: ptr)
}

func loadResource(_ name: String, ext: String) -> String {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext),
          let s = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return s
}

func buildHTML(from fileURL: URL) -> String {
    let md = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
    let body = renderMarkdown(md)
    let css = loadResource("style", ext: "css")
    let hljs = loadResource("highlight.min", ext: "js")
    let hljsLight = loadResource("highlight-light.min", ext: "css")
    let hljsDark  = loadResource("highlight-dark.min", ext: "css")
    // Inject IDs into headings after render via JS; also fix task-list bullets
    let injectIDs = """
    (function(){
      var idx = 0;
      document.querySelectorAll('h1,h2,h3,h4').forEach(function(el){
        el.id = 'mkw-heading-' + idx++;
      });
      document.querySelectorAll('li').forEach(function(li){
        if(li.querySelector('input[type="checkbox"]')){
          li.style.listStyle = 'none';
        }
      });
    })();
    """
    return """
    <!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <style>\(css)</style>
    <style media="(prefers-color-scheme: light)">\(hljsLight)</style>
    <style media="(prefers-color-scheme: dark)">\(hljsDark)</style>
    </head><body>
    <div class="markdown-body">\(body)</div>
    <script>\(hljs)</script>
    <script>hljs.highlightAll();\(injectIDs)</script>
    </body></html>
    """
}

// MARK: - Outline TableView (pointer cursor on hover)

class OutlineTableView: NSTableView {
    override func resetCursorRects() {
        for row in 0..<numberOfRows {
            addCursorRect(rect(ofRow: row), cursor: .pointingHand)
        }
    }
}

// MARK: - Theme

enum Theme: String {
    case system, light, dark

    var next: Theme {
        switch self {
        case .system: return .light
        case .light:  return .dark
        case .dark:   return .system
        }
    }

    var symbolName: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max"
        case .dark:   return "moon.fill"
        }
    }
}

// MARK: - Toolbar identifiers

private let toolbarID   = NSToolbar.Identifier("MarkdownToolbar")
private let refreshID   = NSToolbarItem.Identifier("Refresh")
private let themeID     = NSToolbarItem.Identifier("Theme")

// MARK: - Window Controller

class MarkdownWindowController: NSObject,
    NSWindowDelegate, NSToolbarDelegate,
    NSTableViewDataSource, NSTableViewDelegate {

    var window: NSWindow!
    var webView: WKWebView!
    var tableView: NSTableView!
    var currentURL: URL
    var headings: [Heading] = []
    var fileWatcher: DispatchSourceFileSystemObject?
    var currentTheme: Theme = .system
    weak var themeToolbarItem: NSToolbarItem?

    init(fileURL: URL) {
        self.currentURL = fileURL
        if let saved = UserDefaults.standard.string(forKey: "arandu.theme"),
           let theme = Theme(rawValue: saved) {
            self.currentTheme = theme
        }
        super.init()
        buildWindow()
        applyTheme(currentTheme)
        loadContent()
        startFileWatcher()
    }

    deinit { fileWatcher?.cancel() }

    // MARK: Build Window

    func buildWindow() {
        webView = WKWebView()
        webView.allowsMagnification = true

        // Outline table
        let col = NSTableColumn(identifier: .init("heading"))
        col.isEditable = false
        tableView = OutlineTableView()
        tableView.addTableColumn(col)
        tableView.headerView = nil
        tableView.rowHeight = 24
        tableView.selectionHighlightStyle = .sourceList
        tableView.delegate   = self
        tableView.dataSource = self
        tableView.target = self
        tableView.action = #selector(headingClicked)
        tableView.allowsEmptySelection = true

        let sidebarScroll = NSScrollView()
        sidebarScroll.documentView = tableView
        sidebarScroll.hasVerticalScroller = false
        sidebarScroll.drawsBackground = false

        let sidebarContainer = NSView()
        sidebarContainer.addSubview(sidebarScroll)

        let sectionLabel = NSTextField(labelWithString: "OUTLINE")
        sectionLabel.font = .systemFont(ofSize: 10, weight: .semibold)
        sectionLabel.textColor = .secondaryLabelColor
        sectionLabel.translatesAutoresizingMaskIntoConstraints = false
        sidebarContainer.addSubview(sectionLabel)
        sidebarScroll.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            sectionLabel.topAnchor.constraint(equalTo: sidebarContainer.topAnchor, constant: 12),
            sectionLabel.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor, constant: 12),
            sidebarScroll.topAnchor.constraint(equalTo: sectionLabel.bottomAnchor, constant: 4),
            sidebarScroll.leadingAnchor.constraint(equalTo: sidebarContainer.leadingAnchor),
            sidebarScroll.trailingAnchor.constraint(equalTo: sidebarContainer.trailingAnchor),
            sidebarScroll.bottomAnchor.constraint(equalTo: sidebarContainer.bottomAnchor)
        ])

        let splitView = NSSplitView()
        splitView.isVertical = true
        splitView.dividerStyle = .thin
        splitView.addArrangedSubview(sidebarContainer)
        splitView.addArrangedSubview(webView)
        splitView.setHoldingPriority(.defaultLow,     forSubviewAt: 0)
        splitView.setHoldingPriority(.defaultLow + 1, forSubviewAt: 1)

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.title    = "Arandu"
        window.subtitle = currentURL.lastPathComponent
        window.contentView = splitView
        window.delegate    = self
        window.center()
        window.setFrameAutosaveName("Arandu-\(currentURL.path)")
        window.tabbingMode = .disallowed
        window.minSize = NSSize(width: 500, height: 400)

        let toolbar = NSToolbar(identifier: toolbarID)
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.showsBaselineSeparator = true
        window.toolbar = toolbar
        window.titleVisibility = .visible

        splitView.setPosition(220, ofDividerAt: 0)
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: Content

    func loadContent() {
        let md = (try? String(contentsOf: currentURL, encoding: .utf8)) ?? ""
        headings = extractHeadings(from: md)
        tableView.reloadData()

        let html = buildHTML(from: currentURL)
        webView.loadHTMLString(html, baseURL: currentURL.deletingLastPathComponent())
        window?.subtitle = currentURL.lastPathComponent
    }

    func startFileWatcher() {
        fileWatcher?.cancel()
        let fd = Darwin.open(currentURL.path, O_EVTONLY)
        guard fd >= 0 else { return }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd, eventMask: [.write, .rename, .delete], queue: .main)
        source.setEventHandler { [weak self] in self?.loadContent() }
        source.setCancelHandler { Darwin.close(fd) }
        source.resume()
        fileWatcher = source
    }

    @objc func refresh() { loadContent() }

    // MARK: Theme

    func applyTheme(_ theme: Theme) {
        switch theme {
        case .system:
            window.appearance = nil
            webView.appearance = nil
        case .light:
            window.appearance = NSAppearance(named: .aqua)
            webView.appearance = NSAppearance(named: .aqua)
        case .dark:
            window.appearance = NSAppearance(named: .darkAqua)
            webView.appearance = NSAppearance(named: .darkAqua)
        }
        updateThemeIcon(for: theme)
        UserDefaults.standard.set(theme.rawValue, forKey: "arandu.theme")
    }

    func updateThemeIcon(for theme: Theme) {
        guard let item = themeToolbarItem else { return }
        if let btn = item.view as? NSButton {
            btn.image = NSImage(systemSymbolName: theme.symbolName, accessibilityDescription: theme.rawValue)
        }
    }

    @objc func toggleTheme() {
        currentTheme = currentTheme.next
        applyTheme(currentTheme)
    }

    // MARK: Heading click → scroll

    @objc func headingClicked() {
        let row = tableView.clickedRow
        guard row >= 0, row < headings.count else { return }
        let heading = headings[row]
        let js = "document.getElementById('mkw-heading-\(heading.index)')?.scrollIntoView({behavior:'smooth',block:'start'});"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: Toolbar

    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        if id == refreshID {
            let item = NSToolbarItem(itemIdentifier: refreshID)
            let btn  = NSButton(title: "↺  Refresh", target: self, action: #selector(refresh))
            btn.bezelStyle = .rounded
            item.view  = btn
            item.label = ""
            return item
        }
        if id == themeID {
            let item = NSToolbarItem(itemIdentifier: themeID)
            let btn  = NSButton()
            btn.image = NSImage(systemSymbolName: currentTheme.symbolName, accessibilityDescription: currentTheme.rawValue)
            btn.bezelStyle = .texturedRounded
            btn.isBordered = true
            btn.target = self
            btn.action = #selector(toggleTheme)
            item.view  = btn
            item.label = "Theme"
            item.toolTip = "Toggle theme (system / light / dark)"
            if flag { themeToolbarItem = item }
            return item
        }
        return nil
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [themeID, .flexibleSpace, refreshID] }
    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [themeID, .flexibleSpace, refreshID] }

    // MARK: Table

    func numberOfRows(in tableView: NSTableView) -> Int { headings.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let h = headings[row]
        let indent = CGFloat((h.level - 1) * 12)
        let cell = NSTableCellView()

        let tf = NSTextField(labelWithString: h.text)
        tf.font = h.level == 1
            ? .systemFont(ofSize: 13, weight: .semibold)
            : .systemFont(ofSize: 12, weight: h.level == 2 ? .medium : .regular)
        tf.textColor = h.level == 1 ? .labelColor : .secondaryLabelColor
        tf.lineBreakMode = .byTruncatingTail
        tf.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(tf)
        cell.textField = tf

        NSLayoutConstraint.activate([
            tf.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8 + indent),
            tf.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4),
            tf.centerYAnchor.constraint(equalTo: cell.centerYAnchor)
        ])
        return cell
    }

    func windowWillClose(_ notification: Notification) {
        fileWatcher?.cancel()
        fileWatcher = nil
    }
}

// MARK: - CLI Installer

struct CLIInstaller {
    private static let dismissedKey = "arandu.cliOffered"
    private static let cliPaths = ["/usr/local/bin/arandu", "\(NSHomeDirectory())/.local/bin/arandu"]

    private static let cliScript = """
    #!/bin/bash
    APP=""
    for p in "/Applications/Arandu.app" "$HOME/Applications/Arandu.app"; do
        [ -d "$p" ] && APP="$p" && break
    done
    [ -z "$APP" ] && echo "Arandu.app not found." >&2 && exit 1
    if [ "$#" -eq 0 ]; then open "$APP"; else
        PATHS=(); for f in "$@"; do
            PATHS+=("$(cd "$(dirname "$f")" 2>/dev/null && echo "$PWD/$(basename "$f")")")
        done; open -n "$APP" --args "${PATHS[@]}"
    fi
    """

    static func isCLIInstalled() -> Bool {
        cliPaths.contains { FileManager.default.isExecutableFile(atPath: $0) }
    }

    static func hasBeenDismissed() -> Bool {
        UserDefaults.standard.bool(forKey: dismissedKey)
    }

    enum InstallResult {
        case installed(String)
        case cancelled
        case failed(String)
    }

    static func installCLI() -> InstallResult {
        let tmpPath = NSTemporaryDirectory() + "arandu-cli-install"
        do {
            try cliScript.write(toFile: tmpPath, atomically: true, encoding: .utf8)
        } catch {
            return .failed("Could not write temporary file: \(error.localizedDescription)")
        }

        let globalPath = "/usr/local/bin/arandu"
        let fm = FileManager.default
        if fm.isWritableFile(atPath: "/usr/local/bin") {
            do {
                if fm.fileExists(atPath: globalPath) { try fm.removeItem(atPath: globalPath) }
                try fm.copyItem(atPath: tmpPath, toPath: globalPath)
                chmod(globalPath, 0o755)
                try? fm.removeItem(atPath: tmpPath)
                return .installed(globalPath)
            } catch {}
        }

        var error: NSDictionary?
        let script = "do shell script \"cp '\(tmpPath)' '\(globalPath)' && chmod +x '\(globalPath)'\" with administrator privileges"
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(&error)
            if error == nil {
                try? fm.removeItem(atPath: tmpPath)
                return .installed(globalPath)
            }
        }

        let localDir = NSHomeDirectory() + "/.local/bin"
        let localPath = localDir + "/arandu"
        do {
            try fm.createDirectory(atPath: localDir, withIntermediateDirectories: true)
            if fm.fileExists(atPath: localPath) { try fm.removeItem(atPath: localPath) }
            try fm.copyItem(atPath: tmpPath, toPath: localPath)
            chmod(localPath, 0o755)
            try? fm.removeItem(atPath: tmpPath)
            return .installed(localPath)
        } catch {
            try? fm.removeItem(atPath: tmpPath)
            return .failed("Could not install CLI: \(error.localizedDescription)")
        }
    }

    static func offerInstall() {
        let alert = NSAlert()
        alert.messageText = "Install Command Line Tool?"
        alert.informativeText = "The \"arandu\" command lets you open Markdown files from Terminal.\n\nUsage: arandu README.md"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Install")
        alert.addButton(withTitle: "Not Now")
        alert.showsSuppressionButton = true
        alert.suppressionButton?.title = "Do not show this message again"

        let response = alert.runModal()

        if alert.suppressionButton?.state == .on {
            UserDefaults.standard.set(true, forKey: dismissedKey)
        }

        guard response == .alertFirstButtonReturn else { return }

        let result = installCLI()
        let resultAlert = NSAlert()
        switch result {
        case .installed(let path):
            resultAlert.messageText = "CLI Installed"
            resultAlert.informativeText = "The \"arandu\" command was installed at:\n\(path)\n\nYou can now use: arandu README.md"
            resultAlert.alertStyle = .informational
            UserDefaults.standard.set(true, forKey: dismissedKey)
        case .cancelled:
            return
        case .failed(let reason):
            resultAlert.messageText = "Installation Failed"
            resultAlert.informativeText = reason
            resultAlert.alertStyle = .warning
        }
        resultAlert.runModal()
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var controllers: [MarkdownWindowController] = []
    private var openedViaCLI = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let paths = CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("-") }
        if paths.isEmpty {
            showOpenPanel()
        } else {
            openedViaCLI = true
            paths.forEach { openFile(URL(fileURLWithPath: $0)) }
        }
        NSApp.activate(ignoringOtherApps: true)

        if !CLIInstaller.isCLIInstalled() && !CLIInstaller.hasBeenDismissed() {
            CLIInstaller.offerInstall()
        }
    }

    func buildMenu() {
        let mainMenu = NSMenu()

        // App menu
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Arandu", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let cliItem = NSMenuItem(title: "Install Command Line Tool\u{2026}", action: #selector(installCLIFromMenu), keyEquivalent: "")
        cliItem.target = self
        appMenu.addItem(cliItem)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Arandu", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appMenuItem = NSMenuItem()
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // File menu
        let fileMenu = NSMenu(title: "File")
        let openItem = NSMenuItem(title: "Open…", action: #selector(openDocument), keyEquivalent: "o")
        openItem.target = self
        fileMenu.addItem(openItem)
        let fileMenuItem = NSMenuItem()
        fileMenuItem.submenu = fileMenu
        mainMenu.addItem(fileMenuItem)

        // Window menu
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let windowMenuItem = NSMenuItem()
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = mainMenu
    }

    @objc func openDocument() {
        showOpenPanel()
    }

    @objc func installCLIFromMenu() {
        CLIInstaller.offerInstall()
    }

    func showOpenPanel() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.init(filenameExtension: "md")!]
        if panel.runModal() == .OK { panel.urls.forEach { openFile($0) } }
    }

    func openFile(_ url: URL) {
        guard !controllers.contains(where: {
            $0.currentURL.path == url.path && ($0.window?.isVisible ?? false)
        }) else { return }
        controllers.append(MarkdownWindowController(fileURL: url))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func application(_ sender: NSApplication, openFiles filenames: [String]) {
        if openedViaCLI { openedViaCLI = false; return }
        filenames.forEach { openFile(URL(fileURLWithPath: $0)) }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        if openedViaCLI { openedViaCLI = false; return }
        urls.forEach { openFile($0) }
    }
}

// MARK: - Entry point

let app      = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
