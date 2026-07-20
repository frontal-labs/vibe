class Vibe < Formula
  desc "CLI for generating Vibe applications"
  homepage "https://github.com/frontal-labs/vibe"
  url "https://github.com/frontal-labs/vibe.git", using: :git, branch: "master"
  version "0.0.0"
  license "MIT"

  depends_on "bun"
  depends_on "node"

  def install
    # Install all workspace dependencies via Bun (this is a Bun-managed monorepo).
    system "bun", "install"

    # Build only the CLI and its workspace dependencies ("vibe/build",
    # "vibe/errors", "vibe/generators") via a Turbo filter, rather than the
    # entire monorepo (which includes heavy apps like the docs site).
    system "bun", "run", "build", "--filter=@frontal-labs/vibe-cli"

    # Stage the whole monorepo under libexec so the CLI can resolve its
    # workspace dependencies ("vibe/build", "vibe/errors", "vibe/generators")
    # via the symlinks that Bun created in node_modules. Include hidden
    # entries (e.g. .bin) that install normally skips.
    entries = Dir[".*", "*"].reject { |f| %w[. ..].include?(f) }
    (libexec/".").install entries

    # Link the CLI entrypoint into bin/vibe via symlink so its relative
    # imports (../dist/cli.cjs) continue to resolve inside libexec.
    bin.install_symlink libexec/"vibe-cli/bin/vibe.js" => "vibe"
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/vibe --help")
  end
end
