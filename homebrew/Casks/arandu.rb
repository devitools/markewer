cask "arandu" do
  version "0.2.2"

  on_arm do
    sha256 "11755757dd0d49af278df5ba2c2249eda8d3862dd7fcdfff2f38fac0285107c4"
    url "https://github.com/devitools/arandu/releases/download/v#{version}/Arandu_#{version}_aarch64.dmg"
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
