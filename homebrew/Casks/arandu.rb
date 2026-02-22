cask "arandu" do
  version "0.2.1"

  on_arm do
    sha256 "e44338b83a0c55b2aa66c2e0ecc31a585a3f2fc216af026a5f46aca03d40a69e"
    url "https://github.com/devitools/arandu/releases/download/v#{version}/Arandu_#{version}_aarch64.dmg"
  end
  on_intel do
    sha256 "77f9c63b054377ee0e4648646356eeeea36128816c52b3d8d1cfeb38d003bb4c"
    url "https://github.com/devitools/arandu/releases/download/v#{version}/Arandu_#{version}_x64.dmg"
  end

  name "Arandu"
  desc "Minimal Markdown viewer with GFM support, syntax highlighting, and live reload"
  homepage "https://github.com/devitools/arandu"

  depends_on macos: ">= :ventura"

  app "Arandu.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Arandu.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/com.devitools.arandu",
    "~/Library/Caches/com.devitools.arandu",
    "~/Library/Preferences/com.devitools.arandu.plist",
  ]
end
